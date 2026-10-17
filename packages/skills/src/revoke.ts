import { Pool } from "pg";
import type { Principal } from "@asi/contracts";

export interface RevokeSkillConfig {
  pool: Pool;
}

export interface RevokeSkillInput {
  principal: Principal;
  skillVersionId: string;
}

export interface RevokeSkillResult {
  revoked: boolean;
}

export async function revokeSkill(
  config: RevokeSkillConfig,
  input: RevokeSkillInput
): Promise<RevokeSkillResult> {
  const { principal, skillVersionId } = input;
  const { pool } = config;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id','skills',true)", [principal.tenantId]);

    // Check if skill version exists and belongs to tenant
    const skillCheck = await client.query(
      `SELECT skill_version_id, trust_status FROM skill_versions
       WHERE skill_version_id = $1 AND tenant_id = $2`,
      [skillVersionId, principal.tenantId]
    );

    if (skillCheck.rows.length === 0) {
      throw new Error(`Skill version ${skillVersionId} not found for tenant ${principal.tenantId}`);
    }

    // Update skill version trust status to revoked
    await client.query(
      `UPDATE skill_versions SET trust_status = 'revoked'
       WHERE skill_version_id = $1 AND tenant_id = $2`,
      [skillVersionId, principal.tenantId]
    );

    // Update install status to revoked
    const now = new Date().toISOString();
    await client.query(
      `UPDATE skill_installs SET status = 'revoked', revoked_at = $1
       WHERE tenant_id = $2 AND skill_version_id = $3`,
      [now, principal.tenantId, skillVersionId]
    );

    await client.query("COMMIT");
    return { revoked: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export interface RevokePublisherConfig {
  pool: Pool;
}

export interface RevokePublisherInput {
  principal: Principal;
  publisherId: string;
}

export interface RevokePublisherResult {
  revoked: boolean;
}

export async function revokePublisher(
  config: RevokePublisherConfig,
  input: RevokePublisherInput
): Promise<RevokePublisherResult> {
  const { principal, publisherId } = input;
  const { pool } = config;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id','skills',true)", [principal.tenantId]);

    // Revoke publisher trust record
    const now = new Date().toISOString();
    await client.query(
      `UPDATE skill_trust_records SET status = 'revoked', revoked_at = $1
       WHERE tenant_id = $2 AND publisher_id = $3`,
      [now, principal.tenantId, publisherId]
    );

    // Revoke all skill versions from this publisher
    await client.query(
      `UPDATE skill_versions SET trust_status = 'revoked'
       WHERE tenant_id = $1 AND publisher_id = $2`,
      [principal.tenantId, publisherId]
    );

    // Disable all installs of revoked skills
    await client.query(
      `UPDATE skill_installs si SET status = 'revoked', revoked_at = $1
       FROM skill_versions sv
       WHERE si.tenant_id = $2 AND si.skill_version_id = sv.skill_version_id
         AND sv.publisher_id = $3`,
      [now, principal.tenantId, publisherId]
    );

    await client.query("COMMIT");
    return { revoked: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}