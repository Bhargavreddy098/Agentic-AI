import Database from "better-sqlite3";

export interface CursorRow {
  last_episode_sequence: number;
  last_compression_generation: number;
}

export interface PgPool {
  connect(): Promise<{
    query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
    release(): void;
  }>;
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface ReconcileConfig {
  dbPath: string;
  tenantId: string;
  pgPool: PgPool;
}

export interface ReconcileResult {
  reconciledEpisodes: number;
  reconciledCompressions: number;
  pgProjectedEpisodes: number;
  pgProjectedCompressions: number;
  cursorPosition: number;
  errors: string[];
}

export interface CursorState {
  cursorId: string;
  sessionId: string;
  lastEpisodeSequence: number;
  lastCompressionGeneration: number;
  lastUpdated: number;
}

export interface ReconcileCursorConfig {
  dbPath: string;
  tenantId: string;
}

export interface GetCursorInput {
  cursorId: string;
}

export interface UpdateCursorInput {
  cursorId: string;
  sessionId: string;
  lastEpisodeSequence: number;
  lastCompressionGeneration: number;
}


export async function reconcileEpisodes(
  config: ReconcileConfig,
): Promise<ReconcileResult> {
  const { dbPath, tenantId, pgPool } = config;
  const errors: string[] = [];
  let reconciledEpisodes = 0;
  let reconciledCompressions = 0;
  let pgProjectedEpisodes = 0;
  let pgProjectedCompressions = 0;

  const pgClient = await pgPool.connect();

  try {
    await pgClient.query("BEGIN");

const cursorStmt = await pgClient.query<CursorRow>(`
      SELECT last_episode_sequence, last_compression_generation
      FROM episodic_cursors
      WHERE tenant_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [tenantId]);

    const cursor = cursorStmt.rows[0];
    const lastSeq = cursor?.last_episode_sequence ?? 0;
    const lastGen = cursor?.last_compression_generation ?? 0;

    const sqliteEpisodes = new Database(dbPath, { readonly: true });
    const episodes = sqliteEpisodes.prepare(`
      SELECT episode_id, tenant_id, session_id, sequence, kind, content, source_ids, created_at, content_hash
      FROM episodes
      WHERE tenant_id = ? AND sequence > ?
      ORDER BY sequence ASC
    `).all(tenantId, lastSeq) as Array<{
      episode_id: string;
      tenant_id: string;
      session_id: string;
      sequence: number;
      kind: string;
      content: string;
      source_ids: string;
      created_at: number;
      content_hash: string;
    }>;
    sqliteEpisodes.close();

    for (const ep of episodes) {
      await pgClient.query(`
        INSERT INTO pg_episodes (
          episode_id, tenant_id, session_id, sequence, kind, content, source_ids, created_at, content_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (tenant_id, session_id, sequence) DO UPDATE SET
          kind = EXCLUDED.kind,
          content = EXCLUDED.content,
          source_ids = EXCLUDED.source_ids,
          created_at = EXCLUDED.created_at,
          content_hash = EXCLUDED.content_hash
      `, [
        ep.episode_id, ep.tenant_id, ep.session_id, ep.sequence, ep.kind,
        ep.content, ep.source_ids, ep.created_at, ep.content_hash,
      ]);
      pgProjectedEpisodes++;
      reconciledEpisodes++;
    }

    const sqliteCompressions = new Database(dbPath, { readonly: true });
    const compressions = sqliteCompressions.prepare(`
      SELECT
        compression_id, tenant_id, session_id, parent_generation,
        source_range_start, source_range_end, source_digests,
        prefix_hash, summary_hash, model_version, policy_version,
        status, created_at, committed_at
      FROM compressions
      WHERE tenant_id = ? AND parent_generation > ?
      ORDER BY parent_generation ASC
    `).all(tenantId, lastGen) as Array<{
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
    sqliteCompressions.close();

    for (const comp of compressions) {
      await pgClient.query(`
        INSERT INTO pg_compressions (
          compression_id, tenant_id, session_id, parent_generation,
          source_range_start, source_range_end, source_digests,
          prefix_hash, summary_hash, model_version, policy_version,
          status, created_at, committed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (tenant_id, compression_id) DO UPDATE SET
          session_id = EXCLUDED.session_id,
          parent_generation = EXCLUDED.parent_generation,
          source_range_start = EXCLUDED.source_range_start,
          source_range_end = EXCLUDED.source_range_end,
          source_digests = EXCLUDED.source_digests,
          prefix_hash = EXCLUDED.prefix_hash,
          summary_hash = EXCLUDED.summary_hash,
          model_version = EXCLUDED.model_version,
          policy_version = EXCLUDED.policy_version,
          status = EXCLUDED.status,
          created_at = EXCLUDED.created_at,
          committed_at = EXCLUDED.committed_at
      `, [
        comp.compression_id, comp.tenant_id, comp.session_id, comp.parent_generation,
        comp.source_range_start, comp.source_range_end, comp.source_digests,
        comp.prefix_hash, comp.summary_hash, comp.model_version, comp.policy_version,
        comp.status, comp.created_at, comp.committed_at,
      ]);
      pgProjectedCompressions++;
      reconciledCompressions++;
    }

    await pgClient.query(`
      INSERT INTO episodic_cursors (tenant_id, last_episode_sequence, last_compression_generation, updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (tenant_id) DO UPDATE SET
        last_episode_sequence = EXCLUDED.last_episode_sequence,
        last_compression_generation = EXCLUDED.last_compression_generation,
        updated_at = EXCLUDED.updated_at
    `, [tenantId, lastSeq + episodes.length, lastGen + compressions.length, Date.now()]);

    await pgClient.query("COMMIT");

    return {
      reconciledEpisodes,
      reconciledCompressions,
      pgProjectedEpisodes,
      pgProjectedCompressions,
      cursorPosition: lastSeq + episodes.length,
      errors,
    };
  } catch (err) {
    await pgClient.query("ROLLBACK");
    errors.push(err instanceof Error ? err.message : String(err));
    return {
      reconciledEpisodes,
      reconciledCompressions,
      pgProjectedEpisodes,
      pgProjectedCompressions,
      cursorPosition: 0,
      errors,
    };
  } finally {
    await pgClient.release();
  }
}

export async function reconcileCursors(
  config: ReconcileConfig,
): Promise<CursorState> {
  const { tenantId, pgPool } = config;

  const pgClient = await pgPool.connect();
  try {
    await pgClient.query("BEGIN");

    const cursorResult = await pgClient.query<CursorRow>(`
      SELECT last_episode_sequence, last_compression_generation
      FROM episodic_cursors
      WHERE tenant_id = $1
      ORDER BY updated_at DESC
      LIMIT 1
    `, [tenantId]);

    const cursor = cursorResult.rows[0];
    const state: CursorState = {
      cursorId: `cursor-${tenantId}`,
      sessionId: "",
      lastEpisodeSequence: cursor?.last_episode_sequence ?? 0,
      lastCompressionGeneration: cursor?.last_compression_generation ?? 0,
      lastUpdated: Date.now(),
    };

    await pgClient.query("COMMIT");
    return state;
  } catch (err) {
    await pgClient.query("ROLLBACK");
    throw err;
  } finally {
    await pgClient.release();
  }
}

export async function updateCursor(
  config: ReconcileCursorConfig,
  input: UpdateCursorInput,
): Promise<void> {
  const db = new Database(config.dbPath);
  try {
    const stmt = db.prepare(`
      INSERT INTO cursors (cursor_id, session_id, last_episode_sequence, last_compression_generation, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (cursor_id) DO UPDATE SET
        session_id = EXCLUDED.session_id,
        last_episode_sequence = EXCLUDED.last_episode_sequence,
        last_compression_generation = EXCLUDED.last_compression_generation,
        updated_at = EXCLUDED.updated_at
    `);
    stmt.run(
      input.cursorId,
      input.sessionId,
      input.lastEpisodeSequence,
      input.lastCompressionGeneration,
      Date.now(),
    );
  } finally {
    db.close();
  }
}

export async function getCursor(
  config: ReconcileCursorConfig,
  input: GetCursorInput,
): Promise<CursorState | null> {
  const db = new Database(config.dbPath, { readonly: true });
  try {
    const stmt = db.prepare(`
      SELECT cursor_id, session_id, last_episode_sequence, last_compression_generation, updated_at
      FROM cursors
      WHERE cursor_id = ?
    `);
    const row = stmt.get(input.cursorId) as
      | { cursor_id: string; session_id: string; last_episode_sequence: number; last_compression_generation: number; updated_at: number }
      | undefined;

    if (!row) return null;

    return {
      cursorId: row.cursor_id,
      sessionId: row.session_id,
      lastEpisodeSequence: row.last_episode_sequence,
      lastCompressionGeneration: row.last_compression_generation,
      lastUpdated: row.updated_at,
    };
  } finally {
    db.close();
  }
}