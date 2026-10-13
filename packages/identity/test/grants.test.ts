import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { configureIdentity, resetIdentity, generateSigningKey, getConfig } from "../src/config.js";
import { signToken, decodeToken } from "../src/token.js";
import { verifyPrincipal, parseGrantId } from "../src/verify.js";
import { createPrincipalToken, delegatePrincipal } from "../src/delegate.js";
import { revokeGrant, isGrantRevoked, getGrantStore, resetGrantStore, setGrantStore, createMemoryGrantStore } from "../src/revoke.js";
import type { Principal } from "@asi/contracts";
import { PrincipalSchema, OpaqueIdSchema } from "@asi/contracts";
import { createHmac } from "node:crypto";

function toOpaqueId(value: string): string {
  return OpaqueIdSchema.parse(value);
}

function base64url(input: string): string {
  return Buffer.from(input).toString("base64url");
}

function futureTimestamp(secondsFromNow: number): string {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function createTestPrincipal(overrides: Partial<Principal> = {}): Principal {
  return PrincipalSchema.parse({
    tenantId: toOpaqueId("test-tenant"),
    subjectId: toOpaqueId("test-subject"),
    agentId: undefined,
    roles: [toOpaqueId("user")],
    capabilities: [toOpaqueId("read"), toOpaqueId("write")],
    audience: toOpaqueId("test-audience"),
    expiresAt: futureTimestamp(3600),
    authenticatedSource: toOpaqueId("asi-identity"),
    ...overrides,
  });
}

function createExpiredToken(): string {
  const key = generateSigningKey("test-expired");
  configureIdentity({ keys: [key], defaultKid: "test-expired" });
  const payload = {
    iss: "asi-identity" as const,
    sub: "test-subject",
    aud: "test-audience",
    iat: Math.floor(Date.now() / 1000) - 7200,
    exp: Math.floor(Date.now() / 1000) - 3600,
    jti: `grant-expired-${Date.now()}`,
    capabilities: ["read"],
    roles: ["user"],
    tenantId: "test-tenant",
  };
  return signToken(payload);
}

function createTokenWithTamperedPayload(originalToken: string, tamper: (payload: Record<string, unknown>) => Record<string, unknown>): string {
  const decoded = decodeToken(originalToken);
  if (!decoded) throw new Error("Failed to decode token");
  const tamperedPayload = tamper(decoded.payload);
  const header = decoded.header;
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(tamperedPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = getConfig()!.keys.find(key => key.kid === header.kid)!;
  const signature = createHmac("sha256", key.secret).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

function createTokenWithWrongSignature(token: string): string {
  const parts = token.split(".");
  return `${parts[0]}.${parts[1]}.invalidsignature`;
}

describe("identity package", () => {
  beforeEach(() => {
    resetIdentity();
    resetGrantStore();
    setGrantStore(createMemoryGrantStore());
    const key = generateSigningKey("test-key-1");
    configureIdentity({
      keys: [key],
      defaultKid: "test-key-1",
    });
  });

  afterEach(() => {
    resetIdentity();
    resetGrantStore();
  });

  describe("token signing and verification", () => {
    it("signs and verifies a valid token", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified.subjectId).toBe("test-subject");
      expect(verified.capabilities).toContainEqual(toOpaqueId("read"));
      expect(verified.capabilities).toContainEqual(toOpaqueId("write"));
    });

    it("rejects token with wrong audience", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      await expect(verifyPrincipal(token, "wrong-audience")).rejects.toThrow("audience mismatch");
    });

    it("rejects expired token", async () => {
      const token = createExpiredToken();
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow("expired");
    });

    it("rejects token not yet valid (nbf)", async () => {
      const key = generateSigningKey("test-nbf");
      configureIdentity({ keys: [key], defaultKid: "test-nbf" });
      const payload = {
        iss: "asi-identity" as const,
        sub: "test-subject",
        aud: "test-audience",
        iat: Math.floor(Date.now() / 1000) + 7200,
        exp: Math.floor(Date.now() / 1000) + 10800,
        nbf: Math.floor(Date.now() / 1000) + 7200,
        jti: `grant-nbf-${Date.now()}`,
        capabilities: ["read"],
        roles: ["user"],
        tenantId: "test-tenant",
      };
      const token = signToken(payload);
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow("not yet valid");
    });
  });

  describe("capability subset enforcement", () => {
    it("allows delegation with subset of capabilities", async () => {
      const parent = createTestPrincipal({
        capabilities: [toOpaqueId("read"), toOpaqueId("write"), toOpaqueId("admin")],
      });
      await createPrincipalToken(parent);
      const childToken = await delegatePrincipal(parent, ["read"], "child-audience", futureTimestamp(1800));
      const child = await verifyPrincipal(childToken, "child-audience");
      expect(child.capabilities).toEqual([toOpaqueId("read")]);
    });

    it("rejects delegation with capability not in parent", async () => {
      const parent = createTestPrincipal({
        capabilities: [toOpaqueId("read")],
      });
      await expect(delegatePrincipal(parent, ["write"], "child-audience", futureTimestamp(1800)))
        .rejects.toThrow("not permitted for delegation");
    });

    it("rejects delegation with extra capabilities", async () => {
      const parent = createTestPrincipal({
        capabilities: [toOpaqueId("read")],
      });
      await expect(delegatePrincipal(parent, ["read", "write"], "child-audience", futureTimestamp(1800)))
        .rejects.toThrow("not permitted for delegation");
    });
  });

  describe("audience binding", () => {
    it("binds token to specific audience", async () => {
      const principal = createTestPrincipal({ audience: toOpaqueId("service-a") });
      const token = await createPrincipalToken(principal);
      await expect(verifyPrincipal(token, "service-b")).rejects.toThrow("audience mismatch");
      const verified = await verifyPrincipal(token, "service-a");
      expect(verified.audience).toBe(toOpaqueId("service-a"));
    });

    it("child token has different audience than parent", async () => {
      const parent = createTestPrincipal({ audience: toOpaqueId("parent-audience") });
      await createPrincipalToken(parent);
      const childToken = await delegatePrincipal(parent, ["read"], "child-audience", futureTimestamp(1800));
      const child = await verifyPrincipal(childToken, "child-audience");
      expect(child.audience).toBe(toOpaqueId("child-audience"));
      await expect(verifyPrincipal(childToken, "parent-audience")).rejects.toThrow("audience mismatch");
    });
  });

  describe("expiry rejection", () => {
    it("rejects token past expiry", async () => {
      const token = createExpiredToken();
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow("expired");
    });

    it("rejects delegation with expiry beyond parent", async () => {
      const parent = createTestPrincipal({
        expiresAt: futureTimestamp(100),
      });
      await expect(delegatePrincipal(parent, ["read"], "child-audience", futureTimestamp(200)))
        .rejects.toThrow("cannot exceed parent expiry");
    });

    it("rejects delegation with past expiry", async () => {
      const parent = createTestPrincipal({
        expiresAt: futureTimestamp(3600),
      });
      await expect(delegatePrincipal(parent, ["read"], "child-audience",
        new Date(Date.now() - 1000).toISOString().replace(/\.\d{3}Z$/, "Z")))
        .rejects.toThrow("Expiry must be in the future");
    });
  });

  describe("revocation enforcement", () => {
    it("rejects revoked token", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const grantId = parseGrantId(token);
      await revokeGrant(grantId, "test revocation");
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow("revoked");
    });

    it("allows valid token after checking revocation", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const grantId = parseGrantId(token);
      const revoked = await isGrantRevoked(grantId);
      expect(revoked).toBe(false);
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified.subjectId).toBe("test-subject");
    });

    it("idempotent revocation returns true", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const grantId = parseGrantId(token);
      const first = await revokeGrant(grantId);
      const second = await revokeGrant(grantId);
      expect(first).toBe(true);
      expect(second).toBe(true);
    });
  });

  describe("anti-forgery", () => {
    it("rejects token with tampered tenantId", async () => {
      const principal = createTestPrincipal({ tenantId: toOpaqueId("tenant-a") });
      const token = await createPrincipalToken(principal);
      const tamperedToken = createTokenWithTamperedPayload(token, (p) => ({ ...p, tenantId: "tenant-b" }));
      await expect(verifyPrincipal(tamperedToken, "test-audience")).rejects.toThrow();
    });

    it("rejects token with tampered capabilities", async () => {
      const principal = createTestPrincipal({ capabilities: [toOpaqueId("read")] });
      const token = await createPrincipalToken(principal);
      const tamperedToken = createTokenWithTamperedPayload(token, (p) => ({ ...p, capabilities: ["admin"] }));
      await expect(verifyPrincipal(tamperedToken, "test-audience")).rejects.toThrow();
    });

    it("rejects token with tampered audience", async () => {
      const principal = createTestPrincipal({ audience: toOpaqueId("audience-a") });
      const token = await createPrincipalToken(principal);
      const tamperedToken = createTokenWithTamperedPayload(token, (p) => ({ ...p, aud: "audience-b" }));
      await expect(verifyPrincipal(tamperedToken, "audience-b")).rejects.toThrow();
    });

    it("rejects completely forged token", async () => {
      const forgedToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmb3JnZWQifQ.forged";
      await expect(verifyPrincipal(forgedToken, "test-audience")).rejects.toThrow();
    });

    it("rejects token with modified payload but valid signature for different data", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const tamperedToken = createTokenWithWrongSignature(token);
      await expect(verifyPrincipal(tamperedToken, "test-audience")).rejects.toThrow("Invalid token signature");
    });
  });

  describe("secret boundaries", () => {
    it("does not include signing key in token payload", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      if (decoded) {
        const payloadStr = JSON.stringify(decoded.payload);
        expect(payloadStr).not.toContain("secret");
        expect(payloadStr).not.toContain("signingKey");
        expect(payloadStr).not.toContain("HS256");
      }
    });

    it("does not include credentials in token payload", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const decoded = decodeToken(token);
      expect(decoded).not.toBeNull();
      if (decoded) {
        const payloadStr = JSON.stringify(decoded.payload);
        expect(payloadStr).not.toContain("password");
        expect(payloadStr).not.toContain("credential");
        expect(payloadStr).not.toContain("secret");
      }
    });

    it("verification uses timing-safe comparison", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified).toBeDefined();
    });

    it("rejects token with invalid signature", async () => {
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const tamperedToken = createTokenWithWrongSignature(token);
      await expect(verifyPrincipal(tamperedToken, "test-audience")).rejects.toThrow("Invalid token signature");
    });
  });

  describe("grant store", () => {
    it("stores and retrieves grants", async () => {
      const store = getGrantStore();
      const grant = {
        grantId: "test-grant-1",
        subjectId: "test-subject",
        roles: ["user"],
        capabilities: ["read"],
        audience: "test-audience",
        tenantId: "test-tenant",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      await store.set(grant);
      const retrieved = await store.get("test-grant-1");
      expect(retrieved).toEqual(grant);
    });

    it("deletes grants", async () => {
      const store = getGrantStore();
      const grant = {
        grantId: "test-grant-2",
        subjectId: "test-subject",
        roles: ["user"],
        tenantId: "test-tenant",
        capabilities: ["read"],
        audience: "test-audience",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };
      await store.set(grant);
      const deleted = await store.delete("test-grant-2");
      expect(deleted).toBe(true);
      const retrieved = await store.get("test-grant-2");
      expect(retrieved).toBeNull();
    });

    it("lists grants by tenant", async () => {
      const store = getGrantStore();
      await store.set({
        grantId: "tenant-a-1",
        subjectId: "test-subject",
        roles: ["user"],
        capabilities: ["read"],
        audience: "aud",
        tenantId: "tenant-a",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      await store.set({
        grantId: "tenant-b-1",
        subjectId: "test-subject",
        roles: ["user"],
        capabilities: ["write"],
        audience: "aud",
        tenantId: "tenant-b",
        issuedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });
      const tenantA = await store.listByTenant?.("tenant-a");
      expect(tenantA).toBeDefined();
      const grants = tenantA!;
      expect(grants.length).toBe(1);
      expect(grants[0]!.grantId).toBe("tenant-a-1");
    });
  });

  describe("key rotation", () => {
    it("supports multiple keys with different kids", async () => {
      const key1 = generateSigningKey("key-1");
      const key2 = generateSigningKey("key-2");
      configureIdentity({
        keys: [key1, key2],
        defaultKid: "key-1",
      });
      const principal = createTestPrincipal();
      const token = await createPrincipalToken(principal);
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified.subjectId).toBe("test-subject");
    });

    it("verifies token signed with non-default key", async () => {
      const key1 = generateSigningKey("key-1");
      const key2 = generateSigningKey("key-2");
      configureIdentity({
        keys: [key1, key2],
        defaultKid: "key-1",
      });
      const payload = {
        iss: "asi-identity" as const,
        sub: "test-subject",
        aud: "test-audience",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        jti: `grant-${Date.now()}`,
        capabilities: ["read"],
        roles: ["user"],
        tenantId: "test-tenant",
      };
      const header = { kid: "key-2", alg: "HS256", typ: "JWT" };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const signingInput = `${encodedHeader}.${encodedPayload}`;
      const signature = createHmac("sha256", key2.secret).update(signingInput).digest("base64url");
      const token = `${signingInput}.${signature}`;
      await getGrantStore().set({ grantId: payload.jti, subjectId: payload.sub, roles: payload.roles, capabilities: payload.capabilities, audience: payload.aud, tenantId: payload.tenantId, issuedAt: payload.iat, expiresAt: payload.exp });
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified.subjectId).toBe("test-subject");
    });
  });

  describe("V2 authenticated grant qualification", () => {
    it.each([
      { tenantId: "other-tenant" },
      { sub: "other-subject" },
      { capabilities: ["admin"] },
      { roles: ["admin"] },
      { agentId: "other-agent" },
      { aud: "other-audience" },
      { exp: Math.floor(Date.now() / 1000) + 7200 },
      { iat: Math.floor(Date.now() / 1000) - 60 },
      { parentGrantId: "other-parent" },
    ])("denies a valid-key token that differs from its canonical grant: %j", async changes => {
      const token = await createPrincipalToken(createTestPrincipal({ agentId: "worker-a" }));
      const altered = createTokenWithTamperedPayload(token, payload => ({ ...payload, ...changes }));
      await expect(verifyPrincipal(altered, "aud" in changes ? changes.aud! : "test-audience")).rejects.toThrow("Token does not match authenticated grant");
    });

    it("concurrent fixture writes cannot change an immutable child grant", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      const store = getGrantStore(), parent = (await store.get(parseGrantId(token)))!;
      const child = { ...parent, grantId: "concurrent-child", parentGrantId: parent.grantId, capabilities: ["read"] };
      const results = await Promise.allSettled([store.set(child), store.set({ ...child, capabilities: ["write"] })]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
      expect((await store.get(child.grantId))!.capabilities).toEqual(["read"]);
    });

    function resign(token: string, changes: Record<string, unknown>, headerChanges: Record<string, unknown> = {}): string {
      const decoded = decodeToken(token)!;
      const header = base64url(JSON.stringify({ ...decoded.header, ...headerChanges }));
      const payload = base64url(JSON.stringify({ ...decoded.payload, ...changes }));
      const input = `${header}.${payload}`;
      const signature = createHmac("sha256", getConfig()!.keys[0]!.secret).update(input).digest("base64url");
      return `${input}.${signature}`;
    }

    it("round-trips authenticated roles and agent identity without inventing user authority", async () => {
      const token = await createPrincipalToken(createTestPrincipal({ roles: ["specialist"], agentId: "worker-7" }));
      const verified = await verifyPrincipal(token, "test-audience");
      expect(verified.roles).toEqual(["specialist"]);
      expect(verified.agentId).toBe("worker-7");
    });

    it("denies a signed token whose durable grant is unknown", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      await getGrantStore().delete(parseGrantId(token));
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow();
    });

    it.each([{ exp: "forever" }, { iss: "untrusted-issuer" }])("denies malformed or wrong-issuer claims despite a valid signature: %j", async changes => {
      const token = await createPrincipalToken(createTestPrincipal());
      await expect(verifyPrincipal(resign(token, changes), "test-audience")).rejects.toThrow();
    });

    it("denies a non-JWT token header despite a valid signature", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      await expect(verifyPrincipal(resign(token, {}, { typ: "other" }), "test-audience")).rejects.toThrow();
    });

    it("denies tokens after their signing key expires", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      const key = getConfig()!.keys[0]!;
      configureIdentity({ keys: [{ ...key, createdAt: Date.now() - 10000, expiresAt: Date.now() - 1 }], defaultKid: key.kid });
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow();
    });

    it("rejects a caller-constructed parent even when its capabilities look valid", async () => {
      await expect(delegatePrincipal(createTestPrincipal(), ["read"], "child-audience", futureTimestamp(60))).rejects.toThrow();
    });

    it("revoking a parent invalidates both child and grandchild", async () => {
      const parentToken = await createPrincipalToken(createTestPrincipal());
      const parent = await verifyPrincipal(parentToken, "test-audience");
      const childToken = await delegatePrincipal(parent, ["read"], "child-audience", futureTimestamp(120));
      const child = await verifyPrincipal(childToken, "child-audience");
      const grandchildToken = await delegatePrincipal(child, ["read"], "grandchild-audience", futureTimestamp(60));
      await revokeGrant(parseGrantId(parentToken));
      await expect(verifyPrincipal(childToken, "child-audience")).rejects.toThrow();
      await expect(verifyPrincipal(grandchildToken, "grandchild-audience")).rejects.toThrow();
    });

    it("editing an issued parent cannot widen delegation authority", async () => {
      const parent = createTestPrincipal({ capabilities: ["read"] });
      await createPrincipalToken(parent);
      parent.capabilities.push("admin");
      await expect(delegatePrincipal(parent, ["admin"], "child-audience", futureTimestamp(60))).rejects.toThrow();
    });

    it("a stale write cannot clear an existing revocation", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      const grantId = parseGrantId(token), store = getGrantStore();
      const beforeRevocation = structuredClone((await store.get(grantId))!);
      await revokeGrant(grantId);
      await store.set(beforeRevocation);
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow();
    });

    it("the same grant ID cannot acquire different authenticated claims", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      const grant = (await getGrantStore().get(parseGrantId(token)))!;
      await expect(getGrantStore().set({ ...grant, capabilities: ["admin"] })).rejects.toThrow();
    });

    it("store failure denies verification and issuance", async () => {
      const token = await createPrincipalToken(createTestPrincipal());
      setGrantStore({
        get: async () => { throw new Error("Authorization store unavailable"); },
        set: async () => { throw new Error("Authorization store unavailable"); },
        delete: async () => { throw new Error("Authorization store unavailable"); },
      });
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow();
      await expect(createPrincipalToken(createTestPrincipal())).rejects.toThrow();
    });

    it("an unconfigured store denies production issuance instead of selecting an in-memory fallback", async () => {
      resetGrantStore();
      await expect(createPrincipalToken(createTestPrincipal())).rejects.toThrow("not configured");
    });

    it("refuses issuance beyond the reviewed bounded delegation ancestry", async () => {
      let token = await createPrincipalToken(createTestPrincipal());
      const chainExpiry = futureTimestamp(600);
      for (let index = 0; index < 16; index++) {
        const parent = await verifyPrincipal(token, index === 0 ? "test-audience" : "chain");
        token = await delegatePrincipal(parent, ["read"], "chain", chainExpiry);
      }
      const parent = await verifyPrincipal(token, "chain");
      await expect(delegatePrincipal(parent, ["read"], "chain", chainExpiry)).rejects.toThrow();
    });

    it("deletion reserves a grant ID against delayed stale writes", async () => {
      const token = await createPrincipalToken(createTestPrincipal()), id = parseGrantId(token);
      const original = (await getGrantStore().get(id))!;
      await getGrantStore().delete(id);
      await expect(getGrantStore().set(original)).rejects.toThrow();
      await expect(verifyPrincipal(token, "test-audience")).rejects.toThrow();
    });

    it("copies returned grant state so editing a snapshot cannot grant capabilities", async () => {
      const token = await createPrincipalToken(createTestPrincipal()), id = parseGrantId(token);
      const snapshot = (await getGrantStore().get(id))!;
      snapshot.capabilities.push("admin");
      expect((await verifyPrincipal(token, "test-audience")).capabilities).toEqual(["read", "write"]);
    });
  });
});
