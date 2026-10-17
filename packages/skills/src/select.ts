import { Pool } from "pg";
import { createVerify, createHash } from "crypto";
import type { SkillManifest } from "@asi/contracts";
import type { Principal, RunContext } from "@asi/contracts";

export interface SelectSkillsConfig {
  pool: Pool;
}

export interface SelectSkillsInput {
  principal: Principal;
  context: RunContext;
  taskCapabilities: string[];
  limit?: number;
}

export interface SelectSkillsResult {
  skills: SkillManifest[];
}

export async function selectSkills(
  config: SelectSkillsConfig,
  input: SelectSkillsInput
): Promise<SelectSkillsResult> {
  const { principal, context, taskCapabilities, limit = 50 } = input;
  const { pool } = config;

  // Verify tenant matches
  if (principal.tenantId !== context.budgetRef.tenantId) {
    throw new Error("Principal and context tenant mismatch");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id','skills',true)", [principal.tenantId]);

    // Get active trusted publisher keys for this tenant
    const trustResult = await client.query(
      `SELECT publisher_id, public_key FROM skill_trust_records
       WHERE tenant_id = $1 AND status = 'active'`,
      [principal.tenantId]
    );

    const trustedKeys = new Map<string, Buffer>();
    for (const row of trustResult.rows) {
      trustedKeys.set(row.publisher_id, row.public_key);
    }

    // Find installed skill versions matching capabilities
    const capabilityPlaceholders = taskCapabilities.map((_, i) => `$${i + 2}`).join(",");
    const installedResult = await client.query(
      `SELECT sv.* FROM skill_versions sv
       JOIN skill_installs si ON si.skill_version_id = sv.skill_version_id
       WHERE sv.tenant_id = $1
         AND si.tenant_id = $1
         AND si.status = 'installed'
         AND sv.trust_status = 'trusted'
         AND sv.required_capabilities && ARRAY[${capabilityPlaceholders}]::text[]
       ORDER BY sv.created_at DESC
       LIMIT $${taskCapabilities.length + 2}`,
      [principal.tenantId, ...taskCapabilities, limit]
    );

    const skills: SkillManifest[] = [];
    for (const row of installedResult.rows) {
      // Verify publisher is still trusted
      const publicKey = trustedKeys.get(row.publisher_id);
      if (!publicKey) continue; // Publisher revoked

      const manifest = row.manifest_json as SkillManifest;

      // Verify signature still valid
      const canonical = JSON.stringify(manifest, Object.keys(manifest).sort());
      const expectedHash = createVerify("SHA256");
      expectedHash.update("ASI-SKILL-MANIFEST-v1\n" + canonical);
      expectedHash.end();
      if (!expectedHash.verify({ key: publicKey, padding: 1 }, row.publisher_signature)) continue;

      // Verify manifest hash still matches
      const manifestHash = createHash("sha256").update(canonical, "utf8").digest("hex");
      if (manifestHash !== row.manifest_hash.toString("hex")) continue;

      // Verify required capabilities still match (relevance check)
      const hasRelevantCapability = taskCapabilities.some(cap => row.required_capabilities.includes(cap));
      if (!hasRelevantCapability) continue;

      skills.push(manifest);
    }

    await client.query("COMMIT");
    return { skills };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}