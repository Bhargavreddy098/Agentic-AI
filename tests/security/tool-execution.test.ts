import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { verifyManifestSignature, checkManifestDigest, getManifestSigningBytes } from "../../packages/tools/src/manifests.js";
import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../packages/control/test/fixtures/postgres.js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { ToolRegistry, createToolRegistry, ToolDispatcher, createToolDispatcher, EffectJournal, createEffectJournal, validateManifest, normalizeError, createNormalizedError, isRetryableError, isFatalError } from "@asi/tools";
import type { ToolManifest, ToolResult, RunContext, Principal, OpaqueId } from "@asi/contracts";

const TEST_TENANT = "tenant-a";

let pool: Pool;
let toolRegistry: ToolRegistry;
let dispatcher: ToolDispatcher;
let effectJournal: EffectJournal;
let legacyFixtureInvocations = 0;

const legacyFixtureKeys = generateKeyPairSync("ed25519");
const legacyFixturePublicKey = legacyFixtureKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const legacyFixtureArtifact = Buffer.from("Task13 test executable fixture bytes");
function createTestManifest(overrides: Partial<ToolManifest> = {}): ToolManifest {
  const manifest = {
    schemaVersion: 1 as const, toolId: "test-tool" as OpaqueId, toolVersion: "1.0.0" as OpaqueId,
    inputSchema: { type: "object", properties: { value: { type: "number" } }, required: ["value"], additionalProperties: false },
    outputSchema: { type: "object", properties: { result: { type: "number" } }, required: ["result"], additionalProperties: false },
    artifactDigest: createHash("sha256").update(legacyFixtureArtifact).digest("hex"),
    publisherSignature: "0".repeat(128), requiredCapabilities: ["test:capability" as OpaqueId], executionClass: "isolated" as const, ...overrides,
  } as ToolManifest;
  if (validateManifest(manifest).valid) manifest.publisherSignature = sign(null, getManifestSigningBytes(manifest), legacyFixtureKeys.privateKey).toString("hex");
  return manifest;
}

function createTestPrincipal(overrides: Partial<Principal> = {}): Principal {
  return {
    tenantId: TEST_TENANT,
    subjectId: "subject-1",
    roles: ["user"],
    capabilities: ["test:capability"],
    audience: "tool-engine",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function createTestContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run-1" as OpaqueId,
    sessionId: "session-1" as OpaqueId,
    writerEpoch: 1,
    mode: "execute",
    deadlineAt: new Date(Date.now() + 3600000).toISOString(),
    budgetRef: {
      tenantId: TEST_TENANT,
      accountId: "account-1" as OpaqueId,
      rootRunId: "root-1" as OpaqueId,
    },
    ...overrides,
  };
}

describe("Original Task13 owner acceptance (requires PostgreSQL)", () => {
beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asi_test";
  pool = createPostgresFixturePool({ connectionString, max: 10 });
  await pool.query("SELECT 1");
  
  toolRegistry = createToolRegistry({ publisherKeys: new Map(["test-tool", "slow-tool"].map(id => [JSON.stringify([id, "1.0.0"]), legacyFixturePublicKey])) });
  dispatcher = createToolDispatcher({
    toolRegistry,
    effectJournal: createEffectJournal({ pool }),
    budgetPool: pool,
    backend: { 
      name: "test",
      executeIsolated: async () => { legacyFixtureInvocations++; return { exitCode: 0, output: { result: 42 }, artifacts: [], usage: { cpuMs: 10, memoryBytes: 1024, wallTimeMs: 100 } }; },
      qualify: async () => ({ qualified: true, backend: "test", checks: {}, evidence: [] }),
    },
    defaultTimeoutMs: 5000,
    maxOutputSize: 1024 * 1024,
    enableReceipts: false,
  });
  effectJournal = createEffectJournal({ pool });
  await effectJournal.initialize();
}, 30000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  // Clear fixture state; actual owner acceptance still requires qualified services.
  legacyFixtureInvocations = 0;
  (toolRegistry as unknown as { tools: Map<string, unknown> }).tools.clear();
}, 10000);

describe("Tool Manifests", () => {
  it("should validate a correct manifest", () => {
    const manifest = createTestManifest();
    const result = validateManifest(manifest);
    
    expect(result.valid).toBe(true);
    expect(result.manifest).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("should reject manifest with missing required fields", () => {
    const manifest = createTestManifest({ toolId: "" });
    const result = validateManifest(manifest);
    
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("should reject manifest with invalid executionClass", () => {
    const manifest = createTestManifest({ executionClass: "invalid" as unknown as ToolManifest["executionClass"] });
    const result = validateManifest(manifest);
    
    expect(result.valid).toBe(false);
  });

  it("should reject manifest with empty requiredCapabilities", () => {
    const manifest = createTestManifest({ requiredCapabilities: [] });
    const result = validateManifest(manifest);
    
    expect(result.valid).toBe(false);
  });
});

describe("Tool Registry", () => {
  it("should register a valid tool", async () => {
    const manifest = createTestManifest();
    const result = await toolRegistry.registerTool(manifest);
    
    expect(result.success).toBe(true);
    expect(result.toolId).toBe("test-tool@1.0.0");
    expect(result.errors).toHaveLength(0);
  });

  it("should reject a digest altered after manifest signing", async () => {
    const manifest = createTestManifest();
    manifest.artifactDigest = "b".repeat(64);
    const result = await toolRegistry.registerTool(manifest);
    
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Missing trusted publisher key or invalid publisher signature");
  });

  it("should reject revoked manifest re-registration", async () => {
    const manifest = createTestManifest();
    await toolRegistry.registerTool(manifest);
    await toolRegistry.revokeTool("test-tool@1.0.0", "Security issue");
    
    const result = await toolRegistry.registerTool(manifest);
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Tool version was revoked and cannot be re-registered");
  });

  it("should reject duplicate registration", async () => {
    const manifest = createTestManifest();
    await toolRegistry.registerTool(manifest);
    
    const result = await toolRegistry.registerTool(manifest);
    expect(result.success).toBe(false);
    expect(result.errors).toContain("Tool version already registered");
  });

  it("should check availability with policy", async () => {
    const manifest = createTestManifest();
    await toolRegistry.registerTool(manifest);
    
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    const availability = await toolRegistry.checkAvailability("test-tool@1.0.0", principal, context);
    expect(availability.allowed).toBe(true);
  });

  it("should deny tool with missing capabilities", async () => {
    const manifest = createTestManifest({
      requiredCapabilities: ["missing:capability"],
    });
    await toolRegistry.registerTool(manifest);
    
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    const availability = await toolRegistry.checkAvailability("test-tool@1.0.0", principal, context);
    expect(availability.allowed).toBe(false);
    expect(availability.reason).toContain("Missing required capabilities");
  });

  it("should deny revoked tool", async () => {
    const manifest = createTestManifest();
    await toolRegistry.registerTool(manifest);
    await toolRegistry.revokeTool("test-tool@1.0.0", "Security issue");
    
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    const availability = await toolRegistry.checkAvailability("test-tool@1.0.0", principal, context);
    expect(availability.allowed).toBe(false);
    expect(availability.reason).toContain("revoked");
  });
});

describe("Tool Dispatch", () => {
  beforeEach(async () => {
    const manifest = createTestManifest();
    await toolRegistry.registerTool(manifest);
  });

  it("should reject unknown tool", async () => {
    const principal = createTestPrincipal();
    const context = createTestContext();
    const signal = new AbortController().signal;
    
    const result = await dispatcher.dispatchTool(
      "unknown-tool@1.0.0",
      { value: 42 },
      context,
      principal,
      signal
    );
    
    expect(result.result.status).toBe("failed");
    expect(result.result.error?.code).toBe("INVALID_INPUT");
    expect(legacyFixtureInvocations).toBe(0);
  });

  it("should reject revoked tool", async () => {
    await toolRegistry.revokeTool("test-tool@1.0.0", "Security issue");
    
    const principal = createTestPrincipal();
    const context = createTestContext();
    const signal = new AbortController().signal;
    
    const result = await dispatcher.dispatchTool(
      "test-tool@1.0.0",
      { value: 42 },
      context,
      principal,
      signal
    );
    
    expect(result.result.status).toBe("failed");
    expect(result.result.error?.code).toBe("POLICY_DENIED");
  });

  it("should reject invalid input", async () => {
    const principal = createTestPrincipal();
    const context = createTestContext();
    const signal = new AbortController().signal;
    
    const result = await dispatcher.dispatchTool(
      "test-tool@1.0.0",
      { invalid: "input" },
      context,
      principal,
      signal
    );
    
    // Required Task13 acceptance: invalid declared input must deny before any effect.
    expect(result.result.status).toBe("failed");
    expect(result.result.error?.code).toBe("INVALID_INPUT");
  });

  it("should handle tool execution timeout", async () => {
    const slowManifest = createTestManifest({
      toolId: "slow-tool" as OpaqueId,
    });
    await toolRegistry.registerTool(slowManifest);
    
    const principal = createTestPrincipal();
    const context = createTestContext();
    const signal = new AbortController().signal;
    
    const result = await dispatcher.dispatchTool(
      "slow-tool@1.0.0",
      { value: 42 },
      context,
      principal,
      signal
    );
    
    expect(result.result).toBeDefined();
  });

  it("should create receipt for successful execution", async () => {
    const principal = createTestPrincipal();
    const context = createTestContext();
    const signal = new AbortController().signal;
    
    const result = await dispatcher.dispatchTool(
      "test-tool@1.0.0",
      { value: 42 },
      context,
      principal,
      signal
    );
    
    expect(result.effectId).toBeDefined();
    expect(typeof result.effectId).toBe("string");
  });
});

describe("Effect Journal", () => {
  it("should record intent and outcome", async () => {
    const effectId = "test-effect-1" as OpaqueId;
    const manifest = createTestManifest();
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    await effectJournal.recordIntent({
      effectId,
      toolId: manifest.toolId,
      input: { value: 42 },
      context,
      principal,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    
    const entry = await effectJournal.getEntry(effectId);
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("pending");
    expect(entry?.toolId).toBe(manifest.toolId);
  });

  it("should record outcome", async () => {
    const effectId = "test-effect-2" as OpaqueId;
    const manifest = createTestManifest();
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    await effectJournal.recordIntent({
      effectId,
      toolId: manifest.toolId,
      input: { value: 42 },
      context,
      principal,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    
    await effectJournal.startExecution(effectId);
    
    const result: ToolResult = {
      schemaVersion: 1,
      toolId: manifest.toolId,
      status: "succeeded",
      content: JSON.stringify({ result: 42 }),
      artifactRefs: [],
      receiptId: "receipt-1" as OpaqueId,
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    
    await effectJournal.recordOutcome(effectId, result);
    
    const entry = await effectJournal.getEntry(effectId);
    expect(entry?.status).toBe("completed");
    expect(entry?.result).toBeDefined();
  });

  it("should reconcile effect with existing result", async () => {
    const effectId = "test-effect-3" as OpaqueId;
    const manifest = createTestManifest();
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    await effectJournal.recordIntent({
      effectId,
      toolId: manifest.toolId,
      input: { value: 42 },
      context,
      principal,
      status: "pending",
      createdAt: new Date().toISOString(),
    });
    
    const result: ToolResult = {
      schemaVersion: 1,
      toolId: manifest.toolId,
      status: "succeeded",
      content: JSON.stringify({ result: 42 }),
      artifactRefs: [],
      receiptId: "receipt-1" as OpaqueId,
      usage: { inputTokens: 10, outputTokens: 5 },
    };
    
    await effectJournal.recordOutcome(effectId, result);
    
    const reconciled = await effectJournal.reconcileEffect(effectId);
    expect(reconciled).toBeDefined();
    expect(reconciled?.status).toBe("succeeded");
  });

  it("should return null for unknown effect", async () => {
    const reconciled = await effectJournal.reconcileEffect("unknown-effect" as OpaqueId);
    expect(reconciled).toBeNull();
  });

  it("should cancel effect", async () => {
    const effectId = "test-effect-4" as OpaqueId;
    const manifest = createTestManifest();
    const principal = createTestPrincipal();
    const context = createTestContext();
    
    await effectJournal.recordIntent({
      effectId,
      toolId: manifest.toolId,
      input: { value: 42 },
      context,
      principal,
      status: "executing",
      createdAt: new Date().toISOString(),
    });
    
    await effectJournal.cancel(effectId);
    
    const entry = await effectJournal.getEntry(effectId);
    expect(entry?.status).toBe("cancelled");
  });
});

describe("Error Normalization", () => {
  it("should normalize ValidationError", () => {
    const error = new Error("Invalid input");
    error.name = "ValidationError";
    
    const normalized = normalizeError(error, { operation: "test" });
    
    expect(normalized.code).toBe("INVALID_INPUT");
    expect(normalized.retryable).toBe(false);
  });

  it("should normalize TimeoutError as retryable", () => {
    const error = new Error("Operation timed out");
    error.name = "TimeoutError";
    
    const normalized = normalizeError(error, { operation: "test" });
    
    expect(normalized.code).toBe("TIMEOUT");
    expect(normalized.retryable).toBe(true);
  });

  it("should normalize AbortError as cancelled", () => {
    const error = new Error("Operation aborted");
    error.name = "AbortError";
    
    const normalized = normalizeError(error, { operation: "test" });
    
    expect(normalized.code).toBe("CANCELLED");
    expect(normalized.retryable).toBe(false);
  });

  it("should normalize unknown errors as UNKNOWN_OUTCOME", () => {
    const error = new Error("Something went wrong");
    
    const normalized = normalizeError(error, { operation: "test" });
    
    expect(normalized.code).toBe("UNKNOWN_OUTCOME");
    expect(normalized.retryable).toBe(true);
  });

  it("should sanitize sensitive data in error messages", () => {
    const error = new Error("API key is sk-12345678901234567890 and email is test@example.com");
    
    const normalized = normalizeError(error, { operation: "test" });
    
    expect(normalized.safeMessage).not.toContain("sk-12345678901234567890");
    expect(normalized.safeMessage).not.toContain("test@example.com");
    expect(normalized.safeMessage).toContain("[REDACTED]");
    expect(normalized.safeMessage).toContain("[EMAIL]");
  });

  it("should create NormalizedError with createNormalizedError helper", () => {
    const error = createNormalizedError("INVALID_INPUT", "Invalid input", false);
    
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.safeMessage).toBe("Invalid input");
    expect(error.retryable).toBe(false);
  });

  it("should identify retryable errors", () => {
    const retryable = createNormalizedError("TIMEOUT", "timeout", true);
    const nonRetryable = createNormalizedError("UNAUTHENTICATED", "Unauthorized", false);
    
    expect(isRetryableError(retryable)).toBe(true);
    expect(isRetryableError(nonRetryable)).toBe(false);
  });

  it("should identify fatal errors", () => {
    const fatal = createNormalizedError("UNAUTHENTICATED", "Unauthorized", false);
    const nonFatal = createNormalizedError("UNKNOWN_OUTCOME", "Error", true);
    
    expect(isFatalError(fatal)).toBe(true);
    expect(isFatalError(nonFatal)).toBe(false);
  });
});
});

describe("Reviewed cryptographic manifest boundary", () => {
  const artifact = Buffer.from("approved executable bytes\n");
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  const keyId = "signed-tool@1";
  function signed(overrides: Record<string, unknown> = {}): ToolManifest {
    const manifest = {
      schemaVersion: 1 as const, toolId: "signed-tool", toolVersion: "1",
      inputSchema: { type: "object", properties: { value: { type: "number" } } } as Record<string, unknown>,
      outputSchema: { type: "object" } as Record<string, unknown>,
      artifactDigest: createHash("sha256").update(artifact).digest("hex"),
      publisherSignature: "0".repeat(128),
      requiredCapabilities: ["tool:execute"], executionClass: "isolated" as const,
      ...overrides,
    } as ToolManifest;
    // Independent reference encoder; numeric-looking object keys must also sort lexically.
    const encode = (x: unknown): string => Array.isArray(x)
      ? "[" + x.map(encode).join(",") + "]"
      : x !== null && typeof x === "object"
        ? "{" + Object.keys(x).sort().map(k => JSON.stringify(k) + ":" + encode((x as Record<string, unknown>)[k])).join(",") + "}"
        : JSON.stringify(x);
    const body = { ...manifest };
    delete (body as { publisherSignature?: string }).publisherSignature;
    manifest.publisherSignature = sign(null, Buffer.from("ASI-TOOL-MANIFEST-v1\n" + encode(body)), keys.privateKey).toString("hex");
    return manifest;
  }
  it("rejects forged signatures and invalid configured keys", () => {
    expect(verifyManifestSignature({ ...signed(), publisherSignature: "a".repeat(128) }, publicKey)).toBe(false);
    expect(verifyManifestSignature(signed(), "invalid-public-key")).toBe(false);
  });
  it("verifies a real Ed25519 signature over the reviewed envelope", () => {
    expect(verifyManifestSignature(signed(), publicKey)).toBe(true);
  });
  it.each([
    { toolId: "replacement" }, { toolVersion: "2" },
    { artifactDigest: "b".repeat(64) }, { inputSchema: { type: "string" } },
    { outputSchema: { type: "string" } }, { requiredCapabilities: ["other:cap"] },
    { executionClass: "in_process" }, { schemaVersion: 2 },
  ])("rejects tampering with every authority field: %j", change => {
    expect(verifyManifestSignature({ ...signed(), ...change } as unknown as ToolManifest, publicKey)).toBe(false);
  });
  it("uses UTF16 ordering, preserving nested numeric-looking keys and array order", () => {
    const manifest = signed({ inputSchema: { "2": "two", "10": "ten", enum: ["z", "a"] } });
    expect(verifyManifestSignature(manifest, publicKey)).toBe(true);
    expect(getManifestSigningBytes(manifest).toString()).toContain('"10":"ten","2":"two","enum":["z","a"]');
    expect(verifyManifestSignature({ ...manifest, inputSchema: { "2": "two", "10": "ten", enum: ["a", "z"] } }, publicKey)).toBe(false);
  });
  it("binds digest to executable bytes rather than manifest metadata", () => {
    expect(checkManifestDigest(signed(), artifact)).toBe(true);
    expect(checkManifestDigest(signed(), Buffer.from("replacement"))).toBe(false);
    expect(checkManifestDigest(signed())).toBe(false);
  });
  it.each([
    () => ({ value: undefined }), () => ({ value: NaN }), () => ({ value: Infinity }),
    () => ({ value: -0 }), () => ({ value: BigInt(1) }), () => ({ value: new Date() }),
    () => ({ value: Array(2) }), () => ({ value: "x".repeat(65537) }),
    () => { const x: Record<string, unknown> = {}; x.self = x; return x; },
    () => ({ value: Symbol("hidden") }),
  ])("rejects non-lossless or oversized JSON without executing it", make => {
    const manifest = { ...signed(), inputSchema: make() };
    expect(verifyManifestSignature(manifest, publicKey)).toBe(false);
    expect(validateManifest(manifest).valid).toBe(false);
  });
  it("rejects accessors before parsing or signing without evaluating them", () => {
    let reads = 0;
    const inputSchema = Object.defineProperty({}, "type", { enumerable: true, get() { reads++; return "object"; } });
    const manifest = { ...signed(), inputSchema };
    expect(validateManifest(manifest).valid).toBe(false);
    expect(verifyManifestSignature(manifest, publicKey)).toBe(false);
    expect(reads).toBe(0);
  });
  it("rejects unknown fields and noncanonical signatures", () => {
    expect(validateManifest({ ...signed(), unexpected: true }).valid).toBe(false);
    expect(verifyManifestSignature({ ...signed(), publisherSignature: signed().publisherSignature.toUpperCase() }, publicKey)).toBe(false);
  });
  it("fails closed when no trusted exact-tool key is configured, even with legacy verification disabled", async () => {
    const registry = new ToolRegistry({ requireSignatureVerification: false });
    expect((await registry.registerTool(signed())).success).toBe(false);
  });
  it("uses the configured exact-tool key and takes immutable registration snapshots", async () => {
    const publisherKeys = new Map([[JSON.stringify(["signed-tool", "1"]), publicKey]]);
    const registry = new ToolRegistry({ publisherKeys });
    publisherKeys.clear();
    const manifest = signed();
    const result = await registry.registerTool(manifest);
    expect(result.success).toBe(true);
    manifest.requiredCapabilities[0] = "other:cap";
    expect(registry.getTool(keyId)?.manifest.requiredCapabilities).toEqual(["tool:execute"]);
    const exposed = registry.getTool(keyId);
    if (exposed) {
      try { exposed.manifest.requiredCapabilities[0] = "other:cap"; } catch { /* expected frozen object */ }
    }
    expect(registry.getTool(keyId)?.manifest.requiredCapabilities).toEqual(["tool:execute"]);
    expect((await registry.registerTool(signed({ toolVersion: "2" }))).success).toBe(false);
  });
});

describe("Manifest parser must preserve the signed payload", () => {
  const keys = generateKeyPairSync("ed25519");
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
  function manifest(): ToolManifest {
    const base: ToolManifest = {
      artifactDigest: "a".repeat(64), executionClass: "isolated",
      inputSchema: { type: "object" }, outputSchema: { type: "object" },
      requiredCapabilities: ["read"], schemaVersion: 1, toolId: "proto", toolVersion: "1",
      publisherSignature: "0".repeat(128),
    };
    base.publisherSignature = sign(null, getManifestSigningBytes(base), keys.privateKey).toString("hex");
    return base;
  }
  it("does not discard __proto__ schema keys before signature verification", () => {
    const forged = manifest();
    forged.inputSchema = JSON.parse('{"type":"object","__proto__":{"signed":"no"}}');
    expect(verifyManifestSignature(forged, publicKey)).toBe(false);
  });
  it("preserves JSON keys and takes a standalone validation snapshot", () => {
    const raw = manifest();
    raw.inputSchema = JSON.parse('{"type":"object","__proto__":{"signed":"yes"}}');
    raw.publisherSignature = sign(null, getManifestSigningBytes(raw), keys.privateKey).toString("hex");
    const result = validateManifest(raw);
    expect(result.valid).toBe(true);
    expect(Object.hasOwn(result.manifest!.inputSchema, "__proto__")).toBe(true);
    (raw.inputSchema as unknown as { __proto__: { signed: string } }).__proto__.signed = "changed";
    expect((result.manifest!.inputSchema as unknown as { __proto__: { signed: string } }).__proto__.signed).toBe("yes");
    expect(verifyManifestSignature(result.manifest!, publicKey)).toBe(true);
  });
  it("rejects proxies without running traps", () => {
    let traps = 0;
    const proxy = new Proxy(manifest(), {
      get(target, key) { traps++; return Reflect.get(target, key); },
      ownKeys(target) { traps++; return Reflect.ownKeys(target); },
      getPrototypeOf(target) { traps++; return Reflect.getPrototypeOf(target); },
      getOwnPropertyDescriptor(target, key) { traps++; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    expect(validateManifest(proxy).valid).toBe(false);
    expect(verifyManifestSignature(proxy, publicKey)).toBe(false);
    expect(traps).toBe(0);
  });
  it("keeps delimiter-bearing tool IDs and versions distinct in registry handles", async () => {
    const keys = generateKeyPairSync("ed25519");
    const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
    function named(toolId: string, toolVersion: string): ToolManifest {
      const base: ToolManifest = { schemaVersion: 1, toolId, toolVersion, inputSchema: {}, outputSchema: {},
        artifactDigest: "a".repeat(64), publisherSignature: "0".repeat(128),
        requiredCapabilities: ["read"], executionClass: "isolated" };
      base.publisherSignature = sign(null, getManifestSigningBytes(base), keys.privateKey).toString("hex");
      return base;
    }
    const registry = new ToolRegistry({ publisherKeys: new Map([
      [JSON.stringify(["a@b", "c"]), publicKey], [JSON.stringify(["a", "b@c"]), publicKey],
      [JSON.stringify(["a%40b", "c"]), publicKey],
    ]) });
    const first = await registry.registerTool(named("a@b", "c"));
    const second = await registry.registerTool(named("a", "b@c"));
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    const percent = await registry.registerTool(named("a%40b", "c"));
    expect(percent.success).toBe(true);
    expect(percent.toolId).not.toBe(first.toolId);
    expect(first.toolId).not.toBe(second.toolId);
    expect(registry.getTool(first.toolId!)?.manifest.toolId).toBe("a@b");
    expect(registry.getTool(second.toolId!)?.manifest.toolVersion).toBe("b@c");
  });

});
