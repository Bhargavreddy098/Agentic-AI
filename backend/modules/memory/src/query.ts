import { Pool } from "pg";
import type {
  Principal,
  MemoryQuery,
  MemoryRecord,
} from "@asi/contracts";

export interface MemoryRecordWithTimestamps extends MemoryRecord {
  created_at: string;
  updated_at: string;
}

export interface QueryMemoryConfig {
  pool: Pool;
}

export interface QueryMemoryInput {
  principal: Principal & { ownerAgentId?: string };
  query: MemoryQuery;
  limit?: number;
}

export interface QueryMemoryResult {
  records: MemoryRecordWithTimestamps[];
}

export async function queryMemory(
  config: QueryMemoryConfig,
  input: QueryMemoryInput,
): Promise<QueryMemoryResult> {
  const { principal, query, limit = 50 } = input;
  const { requestedScopes } = query;

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    // Set RLS context
    await client.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [
      principal.tenantId,
      principal.subjectId,
      principal.roles,
      principal.ownerAgentId ?? null,
      "memory_broker",
    ]);

    let whereClause = "tenant_id = $1 AND deleted_at IS NULL";
    const params: unknown[] = [principal.tenantId];
    let paramIndex = 2;

    // Scope filtering
    const scopeConditions: string[] = [];
    if (requestedScopes.includes("Global")) {
      scopeConditions.push("scope = 'Global'");
    }
    if (requestedScopes.includes("Role")) {
      scopeConditions.push(`scope = 'Role' AND role_id = ANY($${paramIndex})`);
      params.push(principal.roles);
      paramIndex++;
    }
    if (requestedScopes.includes("Private")) {
      scopeConditions.push(`scope = 'Private' AND owner_agent_id = $${paramIndex}`);
      params.push(principal.ownerAgentId ?? "");
      paramIndex++;
    }

    if (scopeConditions.length > 0) {
      whereClause += ` AND (${scopeConditions.join(" OR ")})`;
    }

    // Text query
    if (query.query?.type === "text" && query.query.text) {
      whereClause += ` AND value ILIKE $${paramIndex}`;
      params.push(`%${query.query.text}%`);
      paramIndex++;
    }

    // Vector similarity query (requires pgvector)
    if (query.query?.type === "embedding" && query.query.embeddingRef) {
      whereClause += ` AND memory_id IN (
        SELECT memory_id FROM memory_embeddings
        WHERE tenant_id = $1
        ORDER BY embedding <=> $${paramIndex}::vector
        LIMIT $${paramIndex + 1}
      )`;
      params.push(`[${query.query.embeddingRef}]`);
      params.push(limit);
      paramIndex += 2;
    }

    const finalQuery = `
      SELECT
        memory_id, tenant_id, scope, role_id, owner_agent_id,
        version, value, confidence, source_episode_ids,
        authority, sensitivity, created_at, updated_at,
        deleted_at, provenance
      FROM memory_records
      WHERE ${whereClause}
      ORDER BY confidence DESC, created_at DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await client.query(finalQuery, params);
    await client.query("COMMIT");

    const records: MemoryRecordWithTimestamps[] = result.rows.map((row) => ({
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
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    }));

    return { records };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.query("SELECT clear_asi_context()").catch(() => {});
    client.release();
  }
}