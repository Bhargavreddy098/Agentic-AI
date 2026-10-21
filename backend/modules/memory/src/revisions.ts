import { Pool } from "pg";
import { createHash, randomBytes } from "crypto";
import type { Principal, MemoryRecord } from "@asi/contracts";

export interface MemoryRecordWithTimestamps extends MemoryRecord {
  created_at: string;
  updated_at: string;
}

export interface RevertMemoryConfig {
  pool: Pool;
}

export interface RevertMemoryInput {
  principal: Principal & { ownerAgentId?: string };
  memoryId: string;
  revisionId: string;
  tenantId: string;
}

export interface RevertMemoryResult {
  record: MemoryRecordWithTimestamps;
}

export async function revertMemoryRevision(
  config: RevertMemoryConfig,
  input: RevertMemoryInput,
): Promise<RevertMemoryResult> {
  const { principal, memoryId, revisionId, tenantId } = input;

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    // Set RLS context with service role
    await config.pool.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [
      tenantId,
      principal.subjectId,
      principal.roles,
      principal.ownerAgentId ?? null,
      "memory_broker",
    ]);

    // Get the revision to revert to
    const revisionResult = await config.pool.query(
      `
      SELECT * FROM memory_revisions
      WHERE revision_id = $1 AND memory_id = $2 AND tenant_id = $3
      `,
      [revisionId, memoryId, tenantId],
    );

    if (revisionResult.rows.length === 0) {
      throw new Error(`Revision ${revisionId} not found for memory ${memoryId}`);
    }

    const revision = revisionResult.rows[0];

    // Update the memory record to the previous version
    const updateResult = await config.pool.query(
      `
      UPDATE memory_records
      SET value = $1, version = version + 1, confidence = $2,
          source_episode_ids = $3, authority = $4, sensitivity = $5,
          updated_at = NOW()
      WHERE tenant_id = $6 AND memory_id = $7
      RETURNING memory_id, version, value, confidence, source_episode_ids, authority, sensitivity, created_at, updated_at
      `,
      [
        revision.value,
        revision.confidence,
        revision.source_episode_ids,
        revision.authority,
        revision.sensitivity,
        tenantId,
        memoryId,
      ],
    );

    if (updateResult.rows.length === 0) {
      throw new Error(`Memory record ${memoryId} not found or access denied`);
    }

    // Record the reversion as a new revision
    const newRevisionId = randomBytes(16).toString("hex");
    const now = Date.now();

    await config.pool.query(
      `
      INSERT INTO memory_revisions (
        revision_id, memory_id, tenant_id, version, value, confidence,
        source_episode_ids, authority, sensitivity, changed_by, changed_at,
        change_reason, previous_hash, new_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        newRevisionId,
        memoryId,
        tenantId,
        revision.version - 1, // or new version
        revision.value,
        revision.confidence,
        revision.source_episode_ids,
        revision.authority,
        revision.sensitivity,
        principal.subjectId,
        new Date(now).toISOString(),
        "reverted to revision " + input.revisionId,
        createHash("sha256").update(Buffer.from(revision.value)).digest("hex"),
        createHash("sha256").update(Buffer.from(revision.value)).digest("hex"),
      ],
    );

    await config.pool.query("COMMIT");

    const row = updateResult.rows[0];

    return {
      record: {
        schemaVersion: 1,
        memoryId: row.memory_id,
        tenantId: row.tenant_id,
        scope: row.scope,
        roleId: row.role_id,
        ownerAgentId: row.owner_agent_id,
        version: row.version,
        value: row.value,
        confidence: row.confidence,
        sourceEpisodeIds: row.source_episode_ids,
        authority: row.authority,
        sensitivity: row.sensitivity,
        created_at: row.created_at.toISOString(),
        updated_at: row.updated_at.toISOString(),
      },
    };
  } catch (err) {
    await config.pool.query("ROLLBACK");
    throw err;
  } finally {
    await config.pool.query("SELECT clear_asi_context()");
    await client.release();
  }
}