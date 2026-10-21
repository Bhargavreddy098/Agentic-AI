import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { configureIdentity, resetIdentity, generateSigningKey, getConfig } from "../../backend/modules/identity/src/config.js";
import { decodeToken } from "../../backend/modules/identity/src/token.js";

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
    const { signToken } = await import("../../backend/modules/identity/src/token.js");
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

describe("native identity process credential refusal", () => {
  it("does not inherit signing or provider credentials and refuses issuance without bootstrap", () => {
    const script = `import * as identity from './backend/modules/identity/dist/index.js';
      let denied=false;try{await identity.createPrincipalToken({tenantId:'a',subjectId:'s',roles:['admin'],capabilities:['admin'],audience:'owner',expiresAt:new Date(Date.now()+60000).toISOString(),authenticatedSource:'asi-identity'});}catch{denied=true;}
      console.log(JSON.stringify({denied,keysConfigured:identity.getConfig()!==null,credentialNames:Object.keys(process.env).filter(k=>/^(IDENTITY_SIGNING_KEYS_JSON|DATABASE_URL|PGPASSWORD|OPENAI_API_KEY|ANTHROPIC_API_KEY)$/.test(k))}));`;
    const env = Object.fromEntries(["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap(name => process.env[name] === undefined ? [] : [[name, process.env[name]!] ]));
    const result = spawnSync(process.execPath,["--input-type=module","-e",script],{cwd:resolve(import.meta.dirname,"../.."),env,encoding:"utf8",timeout:10000});
    expect(result.error).toBeUndefined();expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({denied:true,keysConfigured:false,credentialNames:[]});
  });
});
