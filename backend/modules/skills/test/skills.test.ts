import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHash, sign as cryptoSign, generateKeyPairSync } from "crypto";
import { Pool } from "pg";
import {
  discoverSkills,
  installSkill,
  revokeSkill,
  revokePublisher,
  selectSkills,
  verifyManifest,
  computeManifestHash,
  createSkillVersionId,
} from "../src/index.js";
import type { SkillManifest, ToolManifest } from "@asi/contracts";

const TEST_TENANT = "test-skills-tenant";
const url = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5433/asi_skills_test";

describe("Skills Package", () => {
  let pool: Pool;
  let principal: { tenantId: string; subjectId: string; agentId: string; roles: string[]; capabilities: string[]; audience: string; expiresAt: string; authenticatedSource: string };
  let trustedKeys: Map<string, string>;
  let skillManifest: SkillManifest;
  let installedSkillVersionId: string;
  let testPublicKeyPem: string;
  let testPrivateKeyPem: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: url, max: 5 });
    
    // Ensure test tenant exists
    await pool.query("INSERT INTO tenants(tenant_id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [TEST_TENANT, "Test Skills Tenant"]);
    
    // Generate a real Ed25519 key pair for testing
    const keyPair = generateKeyPairSync("ed25519", { 
      publicKeyEncoding: { type: "spki", format: "pem" }, 
      privateKeyEncoding: { type: "pkcs8", format: "pem" } 
    });
    testPublicKeyPem = keyPair.publicKey;
    testPrivateKeyPem = keyPair.privateKey;

    principal = {
      tenantId: TEST_TENANT,
      subjectId: "test-user",
      agentId: "test-agent",
      roles: ["admin"],
      capabilities: ["test-capability"],
      audience: "skills-test",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      authenticatedSource: "test",
    };

    trustedKeys = new Map();
    trustedKeys.set("test-publisher", testPublicKeyPem);

    // Create a test tool manifest that matches ToolManifestSchema
    const toolManifest: ToolManifest = {
      schemaVersion: 1,
      toolId: "test-tool",
      toolVersion: "1.0.0",
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: {} },
      artifactDigest: "a".repeat(64),
      publisherSignature: "b".repeat(64),
      requiredCapabilities: ["test-capability"],
      executionClass: "isolated" as const,
    };

    // Create a test skill manifest that matches SkillManifestSchema
    const manifestBase: SkillManifest = {
      schemaVersion: 1,
      skillId: "test-skill",
      skillVersion: "1.0.0",
      publisherId: "test-publisher",
      publisherSignature: "",
      artifactHash: "",
      requiredCapabilities: ["test-capability"],
      applicableTaskTypes: ["test-task"],
      scriptManifests: [toolManifest],
      trustStatus: "trusted" as const,
    };

    // Compute artifact hash from manifest without artifactHash and publisherSignature
    const manifestForHash: Record<string, unknown> = { ...manifestBase };
    delete manifestForHash.artifactHash;
    delete manifestForHash.publisherSignature;
    const canonicalForHash = JSON.stringify(manifestForHash, Object.keys(manifestForHash).sort());
    const artifactHash = createHash("sha256").update(canonicalForHash, "utf8").digest("hex");
    manifestBase.artifactHash = artifactHash;

    // Canonical form for signing: excludes both artifactHash and publisherSignature (same as verification)
    const manifestForSigning: Record<string, unknown> = { ...manifestBase };
    delete manifestForSigning.artifactHash;
    delete manifestForSigning.publisherSignature;
    const canonicalForSigning = JSON.stringify(manifestForSigning, Object.keys(manifestForSigning).sort());

    // Sign the manifest using the real private key
    manifestBase.publisherSignature = cryptoSign(null, Buffer.from("ASI-SKILL-MANIFEST-v1\n" + canonicalForSigning, "utf8"), testPrivateKeyPem).toString("hex");

    skillManifest = manifestBase;
    installedSkillVersionId = "";
  }, 30000);

  afterAll(async () => {
    if (pool) await pool.end();
  });

  describe("verify.ts", () => {
    it("should canonicalize and compute hash correctly", () => {
      const hash1 = computeManifestHash(skillManifest);
      const hash2 = computeManifestHash(skillManifest);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it("should verify manifest correctly", () => {
      const valid = verifyManifest(skillManifest, testPublicKeyPem);
      expect(valid).toBe(true);
    });

    it("should reject tampered manifest", () => {
      const tampered = { ...skillManifest, skillVersion: "2.0.0" };
      const valid = verifyManifest(tampered, testPublicKeyPem);
      expect(valid).toBe(false);
    });

    it("should create deterministic skill version ID", () => {
      const id1 = createSkillVersionId("pub1", "skill1", "1.0.0");
      const id2 = createSkillVersionId("pub1", "skill1", "1.0.0");
      expect(id1).toBe(id2);
      expect(id1).toHaveLength(32);
    });
  });

  describe("install.ts", () => {
    it("should install a valid skill manifest", async () => {
      const result = await installSkill(
        { pool, trustedKeys },
        { principal, manifest: skillManifest }
      );
      expect(result.skillVersionId).toBeDefined();
      // UUID format: 36 characters (32 hex + 4 hyphens)
      expect(result.skillVersionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      installedSkillVersionId = result.skillVersionId;
    });

    it("should reject manifest with unknown publisher", async () => {
      const unknownManifest = { ...skillManifest, publisherId: "unknown-publisher" };
      unknownManifest.publisherSignature = skillManifest.publisherSignature;
      unknownManifest.artifactHash = skillManifest.artifactHash;

      await expect(installSkill(
        { pool, trustedKeys: new Map() },
        { principal, manifest: unknownManifest }
      )).rejects.toThrow("not trusted");
    });

    it("should reject manifest with invalid signature", async () => {
      const badManifest = { ...skillManifest, publisherSignature: "x".repeat(64) };
      badManifest.artifactHash = skillManifest.artifactHash;

      await expect(installSkill(
        { pool, trustedKeys },
        { principal, manifest: badManifest }
      )).rejects.toThrow("Invalid publisher signature");
    });

    it("should reject manifest with hash mismatch", async () => {
      const badManifest = { ...skillManifest, artifactHash: "a".repeat(64) };
      await expect(installSkill(
        { pool, trustedKeys },
        { principal, manifest: badManifest }
      )).rejects.toThrow("Manifest artifact hash mismatch");
    });
  });

  describe("discover.ts", () => {
    it("should discover installed skills matching capabilities", async () => {
      const result = await discoverSkills(
        { pool },
        { principal, taskCapabilities: ["test-capability"] }
      );
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
    });

    it("should not discover skills for non-matching capabilities", async () => {
      const result = await discoverSkills(
        { pool },
        { principal, taskCapabilities: ["non-existent-capability"] }
      );
      expect(result.skills).toHaveLength(0);
    });
  });

  describe("select.ts", () => {
    it("should select skills for a run context", async () => {
      const context = {
        runId: "test-run",
        sessionId: "test-session",
        writerEpoch: 1,
        mode: "execute" as const,
        deadlineAt: new Date(Date.now() + 3600000).toISOString(),
        budgetRef: { tenantId: TEST_TENANT, accountId: "test-account", rootRunId: "test-run" },
      };

      const result = await selectSkills(
        { pool },
        { principal, context, taskCapabilities: ["test-capability"] }
      );
      expect(result.skills).toBeDefined();
      expect(Array.isArray(result.skills)).toBe(true);
    });

    it("should reject mismatched tenant in context", async () => {
      const context = {
        runId: "test-run",
        sessionId: "test-session",
        writerEpoch: 1,
        mode: "execute" as const,
        deadlineAt: new Date(Date.now() + 3600000).toISOString(),
        budgetRef: { tenantId: "other-tenant", accountId: "test-account", rootRunId: "test-run" },
      };

      await expect(selectSkills(
        { pool },
        { principal, context, taskCapabilities: ["test-capability"] }
      )).rejects.toThrow("tenant mismatch");
    });
  });

  describe("revoke.ts", () => {
    it("should revoke a skill version", async () => {
      const result = await revokeSkill(
        { pool },
        { principal, skillVersionId: installedSkillVersionId }
      );
      expect(result.revoked).toBe(true);
    });

    it("should reject revoking non-existent skill", async () => {
      // Use a valid UUID format
      await expect(revokeSkill(
        { pool },
        { principal, skillVersionId: "00000000-0000-0000-0000-000000000000" }
      )).rejects.toThrow("not found");
    });
  });

  describe("revoke publisher", () => {
    it("should revoke a publisher and all their skills", async () => {
      // First install another skill from same publisher
      const manifest2: SkillManifest = { ...skillManifest, skillId: "test-skill-2", skillVersion: "1.0.0" };
      // Recompute artifact hash for the new manifest
      const manifestForHash: Record<string, unknown> = { ...manifest2 };
      delete manifestForHash.artifactHash;
      delete manifestForHash.publisherSignature;
      const canonicalForHash = JSON.stringify(manifestForHash, Object.keys(manifestForHash).sort());
      manifest2.artifactHash = createHash("sha256").update(canonicalForHash, "utf8").digest("hex");
      // Sign the new manifest
      const manifestForSigning: Record<string, unknown> = { ...manifest2 };
      delete manifestForSigning.artifactHash;
      delete manifestForSigning.publisherSignature;
      const canonicalForSigning = JSON.stringify(manifestForSigning, Object.keys(manifestForSigning).sort());
      manifest2.publisherSignature = cryptoSign(null, Buffer.from("ASI-SKILL-MANIFEST-v1\n" + canonicalForSigning, "utf8"), testPrivateKeyPem).toString("hex");

      await installSkill({ pool, trustedKeys }, { principal, manifest: manifest2 });

      // Now revoke publisher
      const result = await revokePublisher(
        { pool },
        { principal, publisherId: "test-publisher" }
      );
      expect(result.revoked).toBe(true);
    });

    it("should prevent discovery of revoked publisher skills", async () => {
      const result = await discoverSkills(
        { pool },
        { principal, taskCapabilities: ["test-capability"] }
      );
      expect(result.skills).toHaveLength(0);
    });
  });
});