import { createPostgresFixturePool, type PostgresFixturePool as Pool } from "../../backend/modules/control/test/fixtures/postgres.js";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { routeInference, classifyText, redactWithClassification, getPrincipalClearance, type RouteInferenceConfig, type RouteInferenceInput } from "@asi/privacy";


let pool: Pool;
let testAccountId: string;

function createRouteConfig(): RouteInferenceConfig {
  return {
    pool,
    budgetPool: pool,
    localModels: [
      {
        modelId: "local-gpt",
        modelClass: "generation",
        endpoint: "http://localhost:8080",
        capabilities: ["inference"],
        maxSensitivity: "restricted",
      },
      {
        modelId: "local-embedding",
        modelClass: "embedding",
        endpoint: "http://localhost:8081",
        capabilities: ["embedding"],
        maxSensitivity: "restricted",
      },
    ],
    remoteProviders: [
      {
        providerId: "openai",
        name: "OpenAI",
        models: [
          {
            modelId: "gpt-4",
            modelClass: "generation",
            maxTokens: 8192,
            maxOutputTokens: 8192,
            supportedSensitivities: ["public", "internal"],
          },
          {
            modelId: "text-embedding-3-small",
            modelClass: "embedding",
            maxTokens: 8192,
            maxOutputTokens: 8192,
            supportedSensitivities: ["public", "internal", "confidential"],
          },
        ],
        credentialsRef: "openai-key",
        maxSensitivity: "internal",
        region: "us-east-1",
        costPerTokenMicroUsd: 1000,
      },
    ],
    signingKey: new Uint8Array(32).fill(1),
    keyId: "test-key",
    uncertaintyThreshold: 0.5,
    maxStreamingTokens: 1000,
  };
}

function createPrincipal(overrides: Partial<RouteInferenceInput["principal"]> = {}): RouteInferenceInput["principal"] {
  return {
    tenantId: "tenant-a",
    subjectId: "subject-1",
    roles: ["user"],
    capabilities: ["inference:local", "inference:remote"],
    audience: "privacy-router",
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function createRouteInput(overrides: {
  principal?: Partial<RouteInferenceInput["principal"]>;
  request?: Partial<RouteInferenceInput["request"]>;
} = {}): RouteInferenceInput {
  return {
    principal: {
      tenantId: "tenant-a",
      subjectId: "subject-1",
      roles: ["user"],
      capabilities: ["inference:local", "inference:remote"],
      audience: "privacy-router",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "platform-adapter",
      ...overrides.principal,
    },
    request: {
      modelClass: "generation",
      promptParts: [{ type: "text", text: "Hello world" }],
      stablePrefix: "",
      sensitivity: "public",
      maxOutputTokens: 100,
      runContext: {
        runId: "run-1",
        sessionId: "session-1",
        writerEpoch: 1,
        mode: "execute",
        deadlineAt: new Date(Date.now() + 3600000).toISOString(),
        budgetRef: {
          tenantId: "tenant-a",
          accountId: testAccountId,
          rootRunId: "root-1",
        },
      },
      budgetReservation: {
        reservationId: "res-1",
        budgetRef: {
          tenantId: "tenant-a",
          accountId: testAccountId,
          rootRunId: "root-1",
        },
        reservedTokens: 100,
        reservedCostMicroUsd: 1000,
        status: "reserved",
      },
      traceId: "trace-1",
      ...overrides.request,
    },
  };
}

beforeAll(async () => {
  const connectionString = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/asi_test";
  pool = createPostgresFixturePool({ connectionString, max: 10 });
  await pool.query("SELECT 1");
}, 30000);

afterAll(async () => {
  await pool?.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM budget_accounts WHERE tenant_id IN ($1, $2)", ["tenant-a", "tenant-b"]);
  await pool.query("DELETE FROM budget_reservations WHERE account_id = $1", [testAccountId]);
  
  // Create test tenant
  await pool.query(
    `INSERT INTO tenants (tenant_id, display_name) VALUES ($1, $2) ON CONFLICT (tenant_id) DO NOTHING`,
    ["tenant-a", "Test Tenant A"]
  );
  
  // Create test budget account with proper UUID
  const result = await pool.query(
    `INSERT INTO budget_accounts (tenant_id, account_name, monthly_limit_micro_usd, current_spend_micro_usd) 
     VALUES ($1, $2, $3, $4) 
     ON CONFLICT (tenant_id, account_name) DO UPDATE SET monthly_limit_micro_usd = $3, current_spend_micro_usd = $4
     RETURNING account_id`,
    ["tenant-a", "test-account", 1000000, 0]
  );
  testAccountId = result.rows[0].account_id;
});

describe("Privacy Router", () => {
  it("routes public content to local model", async () => {
    const config = createRouteConfig();
    const input = createRouteInput({
      request: {
        sensitivity: "public",
        promptParts: [{ type: "text", text: "What is the capital of France?" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(true);
    expect(result.route).toBe("local");
    expect(result.classification.sensitivity).toBe("public");
  });

  it("routes restricted content to local model only", async () => {
    const config = createRouteConfig();
    const input = createRouteInput({
      principal: createPrincipal({ roles: ["admin"] }),
      request: {
        sensitivity: "restricted",
        promptParts: [{ type: "text", text: "SSN: 123-45-6789" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(true);
    expect(result.route).toBe("local");
    expect(result.classification.sensitivity).toBe("restricted");
  });

  it("denies restricted content to non-admin principal", async () => {
    const config = createRouteConfig();
    const input = createRouteInput({
      principal: createPrincipal({ roles: ["user"] }),
      request: {
        sensitivity: "restricted",
        promptParts: [{ type: "text", text: "SSN: 123-45-6789" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toContain("insufficient");
  });

  it("routes internal content to remote provider when local model unavailable", async () => {
    const config = createRouteConfig();
    config.localModels = config.localModels.filter(m => m.modelId !== "local-gpt");
    // Allow confidential sensitivity for remote provider in this test
    config.remoteProviders[0]!.models[0]!.supportedSensitivities = ["public", "internal", "confidential"];
    config.remoteProviders[0]!.maxSensitivity = "confidential";
    config.uncertaintyThreshold = 0.1;

    const input = createRouteInput({
      request: {
        sensitivity: "confidential",
        promptParts: [{ type: "text", text: "Analyze this internal document with email test@example.com" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(true);
    expect(result.route).toBe("remote");
    expect(result.providerId).toBe("openai");
  });

  it("denies when sensitivity exceeds provider max", async () => {
    const config = createRouteConfig();
    config.localModels = config.localModels.filter(m => m.modelId !== "local-gpt");
    const input = createRouteInput({
      principal: createPrincipal({ roles: ["admin"] }),
      request: {
        sensitivity: "restricted",
        promptParts: [{ type: "text", text: "Secret: AKIAIOSFODNN7EXAMPLE" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toContain("provider");
  });

  it("denies when budget exceeded", async () => {
    const config = createRouteConfig();
    config.localModels = config.localModels.filter(m => m.modelId !== "local-gpt");
    config.uncertaintyThreshold = 0;
    await config.budgetPool.query(
      `UPDATE budget_accounts SET current_spend_micro_usd = 999500 WHERE account_id = $1`,
      [testAccountId],
    );

    const input = createRouteInput({
      request: {
        promptParts: [{ type: "text", text: "Expensive generation" }],
      },
    });

    const result = await routeInference(config, input);
    expect(result.allowed).toBe(false);
    expect(result.denialReason).toContain("Budget");
  });

  it("validates content classification", async () => {
    const result = classifyText("My email is test@example.com and API key is sk-12345678901234567890");
    expect(result.piiDetected).toBe(true);
    expect(result.credentialsDetected).toBe(true);
    expect(result.sensitivity).toBe("restricted");
    expect(result.matchedRules.some(r => r.includes("email"))).toBe(true);
    expect(result.matchedRules.some(r => r.includes("api_key"))).toBe(true);
  });

  it("redacts sensitive content correctly", async () => {
    const input = "My email is test@test.com and API key is sk-12345678901234567890";
    const result = redactWithClassification(input);
    expect(result.redacted).toContain("[EMAIL]");
    expect(result.redacted).toContain("[API_KEY]");
    expect(result.classification.piiDetected).toBe(true);
    expect(result.classification.credentialsDetected).toBe(true);
    expect(result.originalHash).not.toBe(result.redactedHash);
  });

  it("validates principal clearance", async () => {
    const adminPrincipal = { tenantId: "t1", subjectId: "s1", roles: ["admin"], capabilities: [], audience: "", expiresAt: "", authenticatedSource: "" };
    const userPrincipal = { tenantId: "t1", subjectId: "s2", roles: ["user"], capabilities: [], audience: "", expiresAt: "", authenticatedSource: "" };

    const adminClearance = getPrincipalClearance(adminPrincipal);
    const userClearance = getPrincipalClearance(userPrincipal);

    expect(adminClearance.clearance).toBe("restricted");
    expect(userClearance.clearance).toBe("confidential");
  });
});

