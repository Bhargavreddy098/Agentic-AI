import { Pool } from "pg";
import { createHash, createVerify } from "crypto";
import type { SkillManifest } from "@asi/contracts";
import type { Principal } from "@asi/contracts";

export interface SkillVersionRow {
  skill_version_id: string;
  tenant_id: string;
  skill_id: string;
  skill_version: string;
  publisher_id: string;
  publisher_signature: Buffer;
  artifact_hash: Buffer;
  required_capabilities: string[];
  applicable_task_types: string[];
  script_manifests: object;
  trust_status: "trusted" | "pending" | "revoked";
  manifest_json: object;
  canonical_bytes: Buffer;
  manifest_hash: Buffer;
  created_at: string;
}

export interface SkillInstallRow {
  install_id: string;
  tenant_id: string;
  skill_version_id: string;
  status: "installed" | "disabled" | "revoked";
  installed_at: string;
  revoked_at: string | null;
}

export interface SkillTrustRecordRow {
  trust_id: string;
  tenant_id: string;
  publisher_id: string;
  public_key: Buffer;
  status: "active" | "revoked";
  revoked_at: string | null;
  created_at: string;
}

export interface DiscoverSkillsConfig {
  pool: Pool;
}

export interface DiscoverSkillsInput {
  principal: Principal;
  taskCapabilities: string[];
  limit?: number;
}

export interface DiscoverSkillsResult {
  skills: SkillManifest[];
}

export async function discoverSkills(
  config: DiscoverSkillsConfig,
  input: DiscoverSkillsInput
): Promise<DiscoverSkillsResult> {
  const { principal, taskCapabilities, limit = 100 } = input;
  const { pool } = config;

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
      // Verify publisher signature
      const publicKey = trustedKeys.get(row.publisher_id);
      if (!publicKey) continue; // Unknown or revoked publisher

      const manifest = row.manifest_json as SkillManifest;
      const canonical = JSON.stringify(manifest, Object.keys(manifest).sort());
      const expectedHash = createHash("sha256").update(canonical, "utf8").digest("hex");
      if (expectedHash !== row.manifest_hash.toString("hex")) continue; // Manifest tampered

      // Verify signature
      const verifier = createVerify("SHA256");
      verifier.update("ASI-SKILL-MANIFEST-v1\n" + canonical);
      verifier.end();
      if (!verifier.verify({ key: publicKey, padding: 1 }, row.publisher_signature)) continue; // Invalid signature

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