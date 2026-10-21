import { Pool } from "pg";
import { randomBytes, createHash } from "crypto";
import type { Principal, MemoryWrite, MemoryRecord } from "@asi/contracts";

export interface MemoryRecordWithTimestamps extends MemoryRecord {
  created_at: string;
  updated_at: string;
}

export interface PublishMemoryConfig {
  pool: Pool;
}

export interface PublishMemoryInput {
  principal: Principal & { ownerAgentId?: string };
  write: MemoryWrite;
  expectedVersion: number | null;
}

export interface PublishMemoryResult {
  record: MemoryRecordWithTimestamps;
}

export async function publishMemory(
  config: PublishMemoryConfig,
  input: PublishMemoryInput,
): Promise<PublishMemoryResult> {
  const { principal, write, expectedVersion } = input;
  const { record } = write;

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    // Set RLS context with service role
    await client.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [
      principal.tenantId,
      principal.subjectId,
      principal.roles,
      principal.ownerAgentId ?? null,
      "memory_broker",
    ]);

    const now = new Date().toISOString();

    if (record.memoryId && expectedVersion !== null) {
      // Update existing record with CAS
      // First get the current record for revision tracking
      const currentResult = await client.query(
        `SELECT version, value, confidence, source_episode_ids, authority, sensitivity FROM memory_records WHERE tenant_id = $1 AND memory_id = $2 AND version = $3`,
        [principal.tenantId, record.memoryId, expectedVersion],
      );

      if (currentResult.rows.length === 0) {
        throw new Error(`CAS failed: memory record ${record.memoryId} version mismatch (expected ${expectedVersion})`);
      }

      const current = currentResult.rows[0];

      // Insert revision record
      const revisionId = randomBytes(16).toString("hex");
      const previousHash = createHash("sha256").update(Buffer.from(current.value)).digest("hex");
      const newHash = createHash("sha256").update(Buffer.from(record.value)).digest("hex");

      await client.query(
        `
        INSERT INTO memory_revisions (
          revision_id, memory_id, tenant_id, version, value, confidence,
          source_episode_ids, authority, sensitivity, changed_by, changed_at,
          change_reason, previous_hash, new_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11, $12, $13)
        `,
        [
          revisionId,
          record.memoryId,
          principal.tenantId,
          current.version,
          current.value,
          current.confidence,
          current.source_episode_ids,
          current.authority,
          current.sensitivity,
          principal.subjectId,
          "updated",
          previousHash,
          newHash,
        ],
      );

      const updateResult = await client.query(
        `
        UPDATE memory_records
        SET value = $1, version = version + 1, confidence = $2,
            source_episode_ids = $3, authority = $4, sensitivity = $5,
            updated_at = NOW(), provenance = $6
        WHERE tenant_id = $7 AND memory_id = $8 AND version = $9
        RETURNING memory_id, tenant_id, scope, role_id, owner_agent_id, version, value, confidence, source_episode_ids, authority, sensitivity, created_at, updated_at
        `,
        [
          record.value,
          record.confidence,
          record.sourceEpisodeIds,
          record.authority,
          record.sensitivity,
          JSON.stringify({ ...record, updatedAt: now }),
          principal.tenantId,
          record.memoryId,
          expectedVersion,
        ],
      );

      if (updateResult.rows.length === 0) {
        throw new Error(`CAS failed: memory record ${record.memoryId} version mismatch (expected ${expectedVersion})`);
      }

      const row = updateResult.rows[0];
      await client.query("COMMIT");

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
          created_at: row.created_at ? new Date(row.created_at).toISOString() : now,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : now,
        },
      };
    } else {
      // Insert new record
      const memoryId = record.memoryId ?? randomBytes(16).toString("hex");

      // Type-safe access to optional fields based on scope
      const roleId = record.scope === "Role" ? record.roleId : null;
      const ownerAgentId = record.scope === "Private" ? record.ownerAgentId : null;

      const insertResult = await client.query(
        `
        INSERT INTO memory_records (
          memory_id, tenant_id, scope, role_id, owner_agent_id,
          version, value, confidence, source_episode_ids,
          authority, sensitivity, created_at, updated_at, provenance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12, $13)
        RETURNING memory_id, tenant_id, scope, role_id, owner_agent_id, version, value, confidence, source_episode_ids, authority, sensitivity, created_at, updated_at
        `,
        [
          memoryId,
          principal.tenantId,
          record.scope,
          roleId,
          ownerAgentId,
          1,
          record.value,
          record.confidence,
          record.sourceEpisodeIds,
          record.authority,
          record.sensitivity,
          now,
          JSON.stringify({ ...record, createdAt: now }),
        ],
      );

      const row = insertResult.rows[0];
      await client.query("COMMIT");

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
          created_at: row.created_at ? new Date(row.created_at).toISOString() : now,
          updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : now,
        },
      };
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.query("SELECT clear_asi_context()").catch(() => {});
    client.release();
  }
}