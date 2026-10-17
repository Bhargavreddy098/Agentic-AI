import { Pool } from "pg";
import { randomUUID } from "crypto";
import { SkillManifestSchema, type SkillManifest } from "@asi/contracts";
import type { Principal } from "@asi/contracts";
import { verifyManifest, computeManifestHash, canonicalizeForHash, createSkillVersionId } from "./verify.js";

export interface InstallSkillConfig {
  pool: Pool;
  trustedKeys: Map<string, string | Buffer>;
}

export interface InstallSkillInput {
  principal: Principal;
  manifest: SkillManifest;
}

export interface InstallSkillResult {
  skillVersionId: string;
}

export async function installSkill(
  config: InstallSkillConfig,
  input: InstallSkillInput
): Promise<InstallSkillResult> {
  const { principal, manifest } = input;
  const { pool, trustedKeys } = config;

  // Validate manifest structure
  const validatedManifest = SkillManifestSchema.parse(manifest);

  // Verify publisher is trusted
  const publicKey = trustedKeys.get(validatedManifest.publisherId);
  if (!publicKey) {
    throw new Error(`Publisher ${validatedManifest.publisherId} not trusted for tenant ${principal.tenantId}`);
  }

  // Verify signature
  if (!verifyManifest(validatedManifest, publicKey)) {
    throw new Error("Invalid publisher signature");
  }

  // Verify manifest hash matches
  const expectedHash = computeManifestHash(validatedManifest);
  if (expectedHash !== validatedManifest.artifactHash) {
    throw new Error("Manifest artifact hash mismatch");
  }

  const skillVersionId = createSkillVersionId(validatedManifest.publisherId, validatedManifest.skillId, validatedManifest.skillVersion);
  const canonicalBytes = Buffer.from(canonicalizeForHash(validatedManifest), "utf8");
  const manifestHash = Buffer.from(expectedHash, "hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id','skills',true)", [principal.tenantId]);

    // Check if skill version already exists
    const existing = await client.query(
      `SELECT skill_version_id FROM skill_versions
       WHERE tenant_id = $1 AND manifest_hash = $2`,
      [principal.tenantId, manifestHash]
    );

    let finalSkillVersionId = skillVersionId;

    if (existing.rows.length > 0) {
      finalSkillVersionId = existing.rows[0].skill_version_id;
    } else {
      finalSkillVersionId = randomUUID();
      // Insert skill version
      await client.query(
        `INSERT INTO skill_versions(
           skill_version_id, tenant_id, skill_id, skill_version, publisher_id,
           publisher_signature, artifact_hash, required_capabilities, applicable_task_types,
           script_manifests, trust_status, manifest_json, canonical_bytes, manifest_hash
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          finalSkillVersionId,
          principal.tenantId,
          validatedManifest.skillId,
          validatedManifest.skillVersion,
          validatedManifest.publisherId,
          validatedManifest.publisherSignature,
          Buffer.from(validatedManifest.artifactHash, "hex"),
          validatedManifest.requiredCapabilities,
          validatedManifest.applicableTaskTypes,
          JSON.stringify(validatedManifest.scriptManifests),
          "pending", // Requires review before trusted
          JSON.stringify(validatedManifest),
          canonicalBytes,
          manifestHash,
        ]
      );
    }

    // Check if already installed
    const existingInstall = await client.query(
      `SELECT install_id FROM skill_installs
       WHERE tenant_id = $1 AND skill_version_id = $2`,
      [principal.tenantId, finalSkillVersionId]
    );

    if (existingInstall.rows.length === 0) {
      // Insert skill install record
      await client.query(
        `INSERT INTO skill_installs(install_id, tenant_id, skill_version_id, status)
         VALUES ($1,$2,$3,'installed')`,
        [randomUUID(), principal.tenantId, finalSkillVersionId]
      );
    } else {
      // Update existing install to installed status
      await client.query(
        `UPDATE skill_installs SET status = 'installed', revoked_at = NULL
         WHERE tenant_id = $1 AND skill_version_id = $2`,
        [principal.tenantId, finalSkillVersionId]
      );
    }

    await client.query("COMMIT");
    return { skillVersionId: finalSkillVersionId };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}