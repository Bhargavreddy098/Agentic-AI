import Database from "better-sqlite3";
import { randomBytes, createHash } from "crypto";
import type { CompressionRecord, Sha256Hex } from "@asi/contracts";

export interface LineageConfig {
  dbPath: string;
  tenantId: string;
}

export interface RecordCompressionInput {
  sessionId: string;
  sourceEpisodeIds: string[];
  sourceRange: { startIndex: number; endIndex: number };
  sourceDigests: Sha256Hex[];
  prefixHash: Sha256Hex;
  summaryHash: Sha256Hex;
  modelVersion: string;
  policyVersion: string;
}

export interface RecordCompressionResult {
  compression: CompressionRecord;
}

export interface GetLineageConfig {
  dbPath: string;
  tenantId: string;
}

export interface GetLineageInput {
  sessionId: string;
  startGeneration?: number;
  endGeneration?: number;
}

export interface GetLineageResult {
  compressions: CompressionRecord[];
}

export function computeContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function recordCompression(
  config: LineageConfig,
  input: RecordCompressionInput,
): Promise<RecordCompressionResult> {
  const db = new Database(config.dbPath);
  try {
    const compressionId = randomBytes(16).toString("hex");
    const now = Date.now();

    const compression: CompressionRecord = {
      schemaVersion: 1,
      compressionId,
      sessionId: input.sessionId,
      parentGeneration: 0,
      sourceRange: {
        startIndex: input.sourceRange.startIndex,
        endIndex: input.sourceRange.endIndex,
      },
      sourceDigests: input.sourceDigests,
      prefixHash: input.prefixHash,
      summaryHash: input.summaryHash,
      modelVersion: input.modelVersion,
      policyVersion: input.policyVersion,
    };

    const insertStmt = db.prepare(`
      INSERT INTO compressions (
        compression_id, tenant_id, session_id, parent_generation,
        source_range_start, source_range_end, source_digests,
        prefix_hash, summary_hash, model_version, policy_version,
        status, created_at, committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      compression.compressionId,
      config.tenantId,
      input.sessionId,
      0,
      input.sourceRange.startIndex,
      input.sourceRange.endIndex,
      JSON.stringify(input.sourceDigests),
      input.prefixHash,
      input.summaryHash,
      input.modelVersion,
      input.policyVersion,
      "committed",
      now,
      now,
    );

    return { compression };
  } finally {
    db.close();
  }
}

export interface GetCompressionsConfig {
  dbPath: string;
  tenantId: string;
}

export interface GetCompressionsInput {
  sessionId: string;
  startGeneration?: number;
  endGeneration?: number;
  limit?: number;
  offset?: number;
}

export interface GetCompressionsResult {
  compressions: CompressionRecord[];
  total: number;
}

export async function getCompressions(
  config: GetCompressionsConfig,
  input: GetCompressionsInput,
): Promise<GetCompressionsResult> {
  const { startGeneration = 0, endGeneration, limit = 50, offset = 0 } = input;

  const db = new Database(config.dbPath, { readonly: true });
  try {
    let whereClause = "tenant_id = ? AND session_id = ? AND parent_generation >= ?";
    const params: unknown[] = [config.tenantId, input.sessionId, startGeneration];

    if (endGeneration !== undefined) {
      whereClause += " AND parent_generation <= ?";
      params.push(endGeneration);
    }

    const countStmt = db.prepare(`
      SELECT COUNT(*) as total
      FROM compressions
      WHERE ${whereClause}
    `);
    const countResult = countStmt.get(config.tenantId, input.sessionId, startGeneration) as { total: number } | undefined;
    const total = countResult?.total ?? 0;

    const selectStmt = db.prepare(`
      SELECT
        compression_id, tenant_id, session_id, parent_generation,
        source_range_start, source_range_end, source_digests,
        prefix_hash, summary_hash, model_version, policy_version,
        status, created_at, committed_at
      FROM compressions
      WHERE ${whereClause}
      ORDER BY parent_generation DESC
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);
    const rows = selectStmt.all(...params) as Array<{
      compression_id: string;
      tenant_id: string;
      session_id: string;
      parent_generation: number;
      source_range_start: number;
      source_range_end: number;
      source_digests: string;
      prefix_hash: string;
      summary_hash: string;
      model_version: string;
      policy_version: string;
      status: string;
      created_at: number;
      committed_at: number | null;
    }>;

    const compressions = rows.map((row) => ({
      schemaVersion: 1 as const,
      compressionId: row.compression_id,
      sessionId: row.session_id,
      parentGeneration: row.parent_generation,
      sourceRange: {
        startIndex: row.source_range_start,
        endIndex: row.source_range_end,
      },
      sourceDigests: JSON.parse(row.source_digests),
      prefixHash: row.prefix_hash,
      summaryHash: row.summary_hash,
      modelVersion: row.model_version,
      policyVersion: row.policy_version,
    }));

    return { compressions, total };
  } finally {
    db.close();
  }
}

export interface GetCompressionByIdConfig {
  dbPath: string;
  tenantId: string;
}

export interface GetCompressionByIdInput {
  compressionId: string;
}

export async function getCompressionById(
  config: GetCompressionByIdConfig,
  input: GetCompressionByIdInput,
): Promise<CompressionRecord | null> {
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const stmt = db.prepare(`
      SELECT
        compression_id, tenant_id, session_id, parent_generation,
        source_range_start, source_range_end, source_digests,
        prefix_hash, summary_hash, model_version, policy_version,
        status, created_at, committed_at
      FROM compressions
      WHERE tenant_id = ? AND compression_id = ?
    `);
    const row = stmt.get(config.tenantId, input.compressionId) as
      | { compression_id: string; tenant_id: string; session_id: string; parent_generation: number; source_range_start: number; source_range_end: number; source_digests: string; prefix_hash: string; summary_hash: string; model_version: string; policy_version: string; status: string; created_at: number; committed_at: number | null }
      | undefined;

    if (!row) return null;

    return {
      schemaVersion: 1,
      compressionId: row.compression_id,
      sessionId: row.session_id,
      parentGeneration: row.parent_generation,
      sourceRange: {
        startIndex: row.source_range_start,
        endIndex: row.source_range_end,
      },
      sourceDigests: JSON.parse(row.source_digests),
      prefixHash: row.prefix_hash,
      summaryHash: row.summary_hash,
      modelVersion: row.model_version,
      policyVersion: row.policy_version,
    };
  } finally {
    db.close();
  }
}