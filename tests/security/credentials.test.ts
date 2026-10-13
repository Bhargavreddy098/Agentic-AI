import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { configureIdentity, resetIdentity, generateSigningKey, getConfig } from "../../packages/identity/src/config.js";
import { decodeToken } from "../../packages/identity/src/token.js";

describe("credentials security", () => {
  beforeEach(() => {
    resetIdentity();
  });

  afterEach(() => {
    resetIdentity();
  });

  it("does not expose signing keys in tokens", async () => {
    const key = generateSigningKey("test-key");
    configureIdentity({ keys: [key], defaultKid: "test-key" });
    const { signToken } = await import("../../packages/identity/src/token.js");
    const token = signToken({
      iss: "asi-identity",
      sub: "test-subject",
      aud: "test-audience",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      jti: `grant-${Date.now()}`,
      capabilities: ["read"],
      roles: ["user"],
      tenantId: "test-tenant",
    });
    const decoded = decodeToken(token);
    expect(decoded).not.toBeNull();
    if (decoded) {
      const payloadStr = JSON.stringify(decoded.payload);
      expect(payloadStr).not.toContain(key.secret);
    }
  });

  it("generates cryptographically secure keys", () => {
    const key1 = generateSigningKey("key-1");
    const key2 = generateSigningKey("key-2");
    expect(key1.secret).not.toBe(key2.secret);
    expect(key1.secret.length).toBeGreaterThanOrEqual(43);
    expect(key2.secret.length).toBeGreaterThanOrEqual(43);
  });

  it("keys have proper structure", () => {
    const key = generateSigningKey("test-key", 3600000);
    expect(key.kid).toBe("test-key");
    expect(key.alg).toBe("HS256");
    expect(key.secret).toBeDefined();
    expect(typeof key.secret).toBe("string");
    expect(key.createdAt).toBeDefined();
    expect(typeof key.createdAt).toBe("number");
    expect(key.expiresAt).toBeDefined();
    expect(typeof key.expiresAt).toBe("number");
    expect(key.expiresAt!).toBeGreaterThan(key.createdAt);
  });

  it("key without TTL has no expiry", () => {
    const key = generateSigningKey("test-key");
    expect(key.expiresAt).toBeUndefined();
  });

  it("config validation rejects missing default kid", () => {
    const key = generateSigningKey("key-1");
    expect(() => configureIdentity({ keys: [key], defaultKid: "non-existent" })).toThrow("not found");
  });

  it("config validation rejects empty keys array", () => {
    expect(() => configureIdentity({ keys: [], defaultKid: "key-1" })).toThrow();
  });

  it("resetIdentity clears config", () => {
    const key = generateSigningKey("test-key");
    configureIdentity({ keys: [key], defaultKid: "test-key" });
    expect(getConfig()).not.toBeNull();
    resetIdentity();
    expect(getConfig()).toBeNull();
  });
});

describe("M03 actual Linux worker credential and mount qualification", () => {
  const root = resolve(import.meta.dirname, "../..");
  const name = `asi-m03-worker-${randomBytes(6).toString("hex")}`;
  const compose = ["compose", "--file", "infra/compose.yaml", "--project-name", "asi-m03-qualification"];
  const docker = (args: string[]) => execFileSync("docker", args, { cwd: root, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  let created = false;

  beforeAll(() => {
    expect(docker(["info", "--format", "{{.OSType}}"]).trim()).toBe("linux");
    docker([...compose, "run", "--detach", "--no-deps", "--name", name, "worker-credential-probe"]);
    created = true;
  }, 40000);

  afterAll(() => { if (created) docker(["rm", "--force", name]); });

  it("the running worker has no private mounts, credential environment or writable root", () => {
    const inspected = JSON.parse(docker(["inspect", name]))[0] as {
      Mounts: { Destination: string; RW: boolean }[];
      Config: { User: string; Env: string[] };
      HostConfig: { ReadonlyRootfs: boolean; NetworkMode: string; CapDrop: string[]; SecurityOpt: string[] };
    };
    // Report names only if this assertion fails; never print environment values.
    const forbidden = inspected.Config.Env.map(entry => entry.split("=")[0]!).filter(key => /^(IDENTITY_SIGNING_KEYS_JSON|DATABASE_URL|PGPASSWORD|POSTGRES_PASSWORD|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/.test(key));
    expect(forbidden).toEqual([]);
    expect(inspected.Mounts).toEqual([]);
    expect(inspected.Config.User).toBe("1000:1000");
    expect(inspected.HostConfig.ReadonlyRootfs).toBe(true);
    expect(inspected.HostConfig.NetworkMode).toBe("none");
    expect(inspected.HostConfig.CapDrop).toContain("ALL");
    expect(inspected.HostConfig.SecurityOpt).toContain("no-new-privileges:true");
  });

  it("the actual worker process cannot mint a signed identity or write to its image", () => {
    const script = `
      import { createPrincipalToken, getConfig } from './packages/identity/dist/index.js';
      import { writeFileSync } from 'node:fs';
      let issuanceDenied = false, writeDenied = false;
      try { await createPrincipalToken({tenantId:'a',subjectId:'s',roles:['admin'],capabilities:['admin'],audience:'owner',expiresAt:new Date(Date.now()+60000).toISOString(),authenticatedSource:'asi-identity'}); } catch { issuanceDenied = true; }
      try { writeFileSync('/app/worker-write', 'unsafe'); } catch { writeDenied = true; }
      console.log(JSON.stringify({issuanceDenied,writeDenied,keysConfigured:getConfig()!==null}));`;
    const result = JSON.parse(docker(["exec", name, "node", "--input-type=module", "-e", script]));
    expect(result).toEqual({ issuanceDenied: true, writeDenied: true, keysConfigured: false });
  });

  it.each(["IDENTITY_SIGNING_KEYS_JSON", "DATABASE_URL", "OPENAI_API_KEY"])("the declared worker denies accidental %s injection without logging its value", key => {
    const secret = "M03_SYNTHETIC_SECRET";
    const result = spawnSync("docker", [...compose, "run", "--rm", "--no-deps", "-e", `${key}=${secret}`, "worker-credential-probe"], { cwd: root, encoding: "utf8", timeout: 30000 });
    expect(result.error).toBeUndefined();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Worker credential configuration denied");
    expect(result.stdout + result.stderr).not.toContain(secret);
  }, 40000);
});
