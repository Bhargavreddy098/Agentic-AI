import type { ToolResult, OpaqueId, RunContext, Principal, NormalizedError } from "@asi/contracts";

export interface EffectJournalDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
}

export interface EffectJournalEntry {
  effectId: OpaqueId;
  toolId: string;
  input: unknown;
  context: RunContext;
  principal: Principal;
  status: "pending" | "executing" | "completed" | "failed" | "cancelled";
  result: ToolResult | undefined;
  error: NormalizedError | undefined;
  createdAt: string;
  startedAt: string | undefined;
  completedAt: string | undefined;
  receiptId: string | undefined;
  writerEpoch: number | undefined;
}

export interface EffectJournalConfig {
  pool: EffectJournalDb;
}

export class EffectJournal {
  private pool: EffectJournalDb;

  constructor(config: EffectJournalConfig) {
    this.pool = config.pool;
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tool_effect_journal (
        effect_id TEXT PRIMARY KEY,
        tool_id TEXT NOT NULL,
        input JSONB NOT NULL,
        context JSONB NOT NULL,
        principal JSONB NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'executing', 'completed', 'failed', 'cancelled')),
        result JSONB,
        error JSONB,
        receipt_id TEXT,
        writer_epoch BIGINT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_effect_journal_run ON tool_effect_journal (
        (context->>'runId')
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_tool_effect_journal_status ON tool_effect_journal (status)
      WHERE status IN ('pending', 'executing')
    `);
  }

  async recordIntent(entry: Omit<EffectJournalEntry, "result" | "error" | "startedAt" | "completedAt" | "receiptId" | "writerEpoch">): Promise<void> {
    const writerEpoch = (entry.context as RunContext & { writerEpoch?: number }).writerEpoch ?? 1;
    const result = await this.pool.query(
      `INSERT INTO tool_effect_journal (effect_id, tool_id, input, context, principal, status, writer_epoch, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        entry.effectId,
        entry.toolId,
        JSON.stringify(entry.input),
        JSON.stringify(entry.context),
        JSON.stringify(entry.principal),
        entry.status,
        writerEpoch,
      ]
    );
    if (result.rowCount === 0) {
      throw new Error(`Effect intent ${entry.effectId} already exists and cannot be overwritten`);
    }
  }

  async startExecution(effectId: OpaqueId, expectedWriterEpoch: number = 1): Promise<void> {
    const result = await this.pool.query(
      `UPDATE tool_effect_journal SET status = 'executing', started_at = NOW()
       WHERE effect_id = $1 AND writer_epoch = $2`,
      [effectId, expectedWriterEpoch]
    );
    if (result.rowCount === 0) {
      throw new Error(`Execution start fenced: writer epoch mismatch or unknown effect ${effectId}`);
    }
  }

  async recordOutcome(effectId: OpaqueId, result: ToolResult, expectedWriterEpoch: number = 1, receiptId?: string): Promise<void> {
    const updateResult = await this.pool.query(
      `UPDATE tool_effect_journal SET status = 'completed', result = $1, completed_at = NOW(), receipt_id = $2
       WHERE effect_id = $3 AND writer_epoch = $4`,
      [JSON.stringify(result), receiptId ?? null, effectId, expectedWriterEpoch]
    );
    if (updateResult.rowCount === 0) {
      throw new Error(`Outcome fenced: writer epoch mismatch or unknown effect ${effectId}`);
    }
  }

  async recordError(effectId: OpaqueId, error: NormalizedError, expectedWriterEpoch: number = 1): Promise<void> {
    const result = await this.pool.query(
      `UPDATE tool_effect_journal SET status = 'failed', error = $1, completed_at = NOW()
       WHERE effect_id = $2 AND writer_epoch = $3`,
      [JSON.stringify(error), effectId, expectedWriterEpoch]
    );
    if (result.rowCount === 0) {
      throw new Error(`Error fenced: writer epoch mismatch or unknown effect ${effectId}`);
    }
  }

  async cancel(effectId: OpaqueId, expectedWriterEpoch: number = 1): Promise<void> {
    const result = await this.pool.query(
      `UPDATE tool_effect_journal SET status = 'cancelled', completed_at = NOW()
       WHERE effect_id = $1 AND writer_epoch = $2`,
      [effectId, expectedWriterEpoch]
    );
    if (result.rowCount === 0) {
      throw new Error(`Cancellation fenced: writer epoch mismatch or unknown effect ${effectId}`);
    }
  }

  async getEntry(effectId: OpaqueId): Promise<EffectJournalEntry | null> {
    const result = await this.pool.query(
      `SELECT * FROM tool_effect_journal WHERE effect_id = $1`,
      [effectId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      effectId: row.effect_id as OpaqueId,
      toolId: row.tool_id as string,
      input: row.input as unknown,
      context: row.context as RunContext,
      principal: row.principal as Principal,
      status: row.status as EffectJournalEntry["status"],
      result: row.result as ToolResult | undefined,
      error: row.error as NormalizedError | undefined,
      createdAt: row.created_at as string,
      startedAt: row.started_at as string | undefined,
      completedAt: row.completed_at as string | undefined,
      receiptId: row.receipt_id as string | undefined,
      writerEpoch: Number(row.writer_epoch),
    };
  }

  async getExistingResult(effectId: OpaqueId): Promise<ToolResult | null> {
    const entry = await this.getEntry(effectId);
    if (entry && entry.status === "completed" && entry.result) {
      return entry.result;
    }
    return null;
  }

  async reconcileEffect(effectId: OpaqueId): Promise<ToolResult | null> {
    const entry = await this.getEntry(effectId);
    if (!entry) return null;

    // If already completed, return existing result
    if (entry.status === "completed" && entry.result) {
      return entry.result;
    }

    // If failed, return error result
    if (entry.status === "failed" && entry.error) {
      return {
        schemaVersion: 1,
        toolId: entry.toolId as OpaqueId,
        status: "failed",
        content: undefined,
        artifactRefs: [],
        receiptId: "" as OpaqueId,
        usage: { inputTokens: 0, outputTokens: 0 },
        error: entry.error,
      };
    }

    // If cancelled or pending, no result yet
    return null;
  }

  async getPendingEffects(olderThanMs: number): Promise<EffectJournalEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM tool_effect_journal 
       WHERE status IN ('pending', 'executing') 
       AND created_at < NOW() - INTERVAL '1 millisecond' * $1`,
      [olderThanMs]
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      effectId: row.effect_id as OpaqueId,
      toolId: row.tool_id as string,
      input: row.input as unknown,
      context: row.context as RunContext,
      principal: row.principal as Principal,
      status: row.status as EffectJournalEntry["status"],
      result: row.result as ToolResult | undefined,
      error: row.error as NormalizedError | undefined,
      createdAt: row.created_at as string,
      startedAt: row.started_at as string | undefined,
      completedAt: row.completed_at as string | undefined,
      receiptId: row.receipt_id as string | undefined,
      writerEpoch: row.writer_epoch !== undefined ? Number(row.writer_epoch) : undefined,
    }));
  }
}

export function createEffectJournal(config: EffectJournalConfig): EffectJournal {
  return new EffectJournal(config);
}