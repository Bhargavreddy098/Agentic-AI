import { randomBytes } from "crypto";
import { OpaqueIdSchema, UtcTimestampSchema, PrincipalSchema } from "@asi/contracts";
import type { Principal } from "@asi/contracts";
import { reserveBudget, settleBudget, type BudgetConfig } from "@asi/budgets";
import type { z } from "zod";
import type { ControlPool } from "@asi/control";

type UtcTimestamp = z.infer<typeof UtcTimestampSchema>;

/**
 * Budget pool type - uses ControlPool from @asi/control which is a pg.Pool.
 * The gateway component can depend on @asi/control (part of govKernel).
 */
export type BudgetPool = ControlPool;

export interface HeartbeatClient {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
  release(): void;
}

export interface HeartbeatDb {
  query<R = unknown>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount?: number | null }>;
  connect(): Promise<HeartbeatClient>;
}

export interface HeartbeatScheduleConfig {
  pool: HeartbeatDb;
  budgetConfig: BudgetConfig;
}

export interface ScheduleHeartbeatInput {
  principal: Principal;
  sessionId: string;
  intervalSeconds: number;
  timezone?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  maxCostMicroUsd?: number;
  maxTokens?: number;
  budgetAccountId?: string;
}

export interface ScheduleHeartbeatResult {
  scheduleId: string;
}

export interface RunDueHeartbeatsInput {
  now: UtcTimestamp;
  limit?: number;
}

export interface RunDueHeartbeatsResult {
  executed: number;
  results: HeartbeatExecutionResult[];
}

export interface HeartbeatExecutionResult {
  scheduleId: string;
  executionId: string;
  scheduledAt: UtcTimestamp;
  executedAt: UtcTimestamp;
  result: "noop" | "completed" | "failed" | "action_needed" | "budget_exceeded";
  details?: Record<string, unknown>;
}

export interface HeartbeatScheduleRow {
  schedule_id: string;
  tenant_id: string;
  session_id: string;
  principal_id: string;
  interval_seconds: number;
  next_run_at: Date;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  max_cost_micro_usd: number;
  max_tokens: number;
  budget_account_id: string | null;
  status: string;
}

export interface HeartbeatExecutionRow {
  execution_id: string;
  schedule_id: string;
  scheduled_at: Date;
  executed_at: Date;
  result: string;
  details: object | null;
  budget_reservation_id: string | null;
  idempotency_key: string;
}

function isQuietHour(now: Date, timezone: string, quietStart?: string, quietEnd?: string): boolean {
  if (!quietStart || !quietEnd) return false;

  const tzTime = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
  const currentMinutes = tzTime.getHours() * 60 + tzTime.getMinutes();

  const [startHour = 0, startMin = 0] = quietStart.split(":").map(Number);
  const [endHour = 0, endMin = 0] = quietEnd.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

function generateId(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString("hex")}`;
}

export async function scheduleHeartbeat(
  config: HeartbeatScheduleConfig,
  input: ScheduleHeartbeatInput,
): Promise<ScheduleHeartbeatResult> {
  const { principal, sessionId, intervalSeconds, timezone = "UTC", quietHoursStart, quietHoursEnd, maxCostMicroUsd = 0, maxTokens = 0, budgetAccountId } = input;

  OpaqueIdSchema.parse(sessionId);
  PrincipalSchema.parse(principal);

  if (intervalSeconds < 10 || intervalSeconds > 86400) {
    throw new Error("Interval must be between 10 and 86400 seconds");
  }

  const now = new Date();
  const scheduleId = generateId("hb");

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO heartbeat_schedules (
        schedule_id, tenant_id, session_id, principal_id, interval_seconds, next_run_at,
        timezone, quiet_hours_start, quiet_hours_end, max_cost_micro_usd, max_tokens, budget_account_id, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active')`,
      [
        scheduleId,
        principal.tenantId,
        sessionId,
        principal.subjectId,
        intervalSeconds,
        new Date(now.getTime() + intervalSeconds * 1000),
        timezone,
        quietHoursStart ?? null,
        quietHoursEnd ?? null,
        maxCostMicroUsd,
        maxTokens,
        budgetAccountId ?? null,
      ],
    );

    await client.query("COMMIT");
    return { scheduleId };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function cancelHeartbeat(
  config: HeartbeatScheduleConfig,
  scheduleId: string,
  tenantId: string,
): Promise<boolean> {
  OpaqueIdSchema.parse(scheduleId);

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `UPDATE heartbeat_schedules SET status = 'cancelled', cancelled_at = clock_timestamp(), updated_at = clock_timestamp()
       WHERE schedule_id = $1 AND tenant_id = $2 AND status = 'active'`,
      [scheduleId, tenantId],
    );

    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runDueHeartbeats(
  config: HeartbeatScheduleConfig,
  input: RunDueHeartbeatsInput,
): Promise<RunDueHeartbeatsResult> {
  const { now, limit = 100 } = input;

  const client = await config.pool.connect();
  try {
    await client.query("BEGIN");

    const schedulesResult = await client.query<HeartbeatScheduleRow>(
      `SELECT * FROM heartbeat_schedules
       WHERE status = 'active' AND next_run_at <= $1
       ORDER BY next_run_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [now, limit],
    );

    const executed: HeartbeatExecutionResult[] = [];

    for (const schedule of schedulesResult.rows) {
      const executionId = generateId("hbe");
      const idempotencyKey = `hb-${schedule.schedule_id}-${new Date(schedule.next_run_at).toISOString()}`;

      let result: HeartbeatExecutionResult["result"] = "noop";
      let details: object | null = null;
      let budgetReservationId: string | null = null;

      // Set asi context for budget operations
      await client.query("SELECT set_asi_context($1, $2, $3, $4, $5)", [
        schedule.tenant_id,
        schedule.principal_id,
        [], // roles not stored on schedule, would need to fetch from principal
        schedule.budget_account_id ?? null,
        "heartbeat_scheduler",
      ]);

      try {
        if (isQuietHour(new Date(now), schedule.timezone, schedule.quiet_hours_start ?? undefined, schedule.quiet_hours_end ?? undefined)) {
          result = "noop";
          details = { reason: "quiet_hour" };
        } else if (schedule.max_cost_micro_usd > 0 || schedule.max_tokens > 0) {
          const budgetAccountId = schedule.budget_account_id ?? "heartbeat";
          const budgetResult = await reserveBudget(
            config.budgetConfig,
            {
              budgetRef: { tenantId: schedule.tenant_id, accountId: budgetAccountId, rootRunId: schedule.session_id },
              tokens: schedule.max_tokens,
              maxCostMicroUsd: schedule.max_cost_micro_usd,
              runId: schedule.session_id,
            },
          );
          budgetReservationId = budgetResult.reservation.reservationId;

          result = "completed";
          details = { budgetReserved: true };

          await settleBudget(
            config.budgetConfig,
            { reservationId: budgetReservationId, actualTokens: 0, actualCostMicroUsd: 0, tenantId: schedule.tenant_id },
          );
          await client.query("SELECT clear_asi_context()");
        } else {
          result = "noop";
          await client.query("SELECT clear_asi_context()");
        }
      } catch (err) {
        await client.query("SELECT clear_asi_context()");
        console.error("Heartbeat catch block:", err);
        if (err instanceof Error && (err.message.includes("Budget exceeded") || err.message.includes("Budget exhausted"))) {
          result = "budget_exceeded";
          details = { error: err.message };
        } else {
          result = "failed";
          details = { error: err instanceof Error ? err.message : String(err) };
        }
      }

      await client.query(
        `INSERT INTO heartbeat_executions (execution_id, schedule_id, scheduled_at, executed_at, result, details, budget_reservation_id, idempotency_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [executionId, schedule.schedule_id, schedule.next_run_at, new Date(now), result, details ? JSON.stringify(details) : null, budgetReservationId, idempotencyKey],
      );

      const newNextRun = new Date(new Date(schedule.next_run_at).getTime() + schedule.interval_seconds * 1000);
      await client.query(
        `UPDATE heartbeat_schedules SET next_run_at = $1, updated_at = clock_timestamp() WHERE schedule_id = $2`,
        [newNextRun, schedule.schedule_id],
      );

      executed.push({
        scheduleId: schedule.schedule_id,
        executionId,
        scheduledAt: schedule.next_run_at.toISOString() as UtcTimestamp,
        executedAt: new Date(now).toISOString() as UtcTimestamp,
        result,
      });
    }

    await client.query("COMMIT");
    return { executed: executed.length, results: executed };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function getHeartbeatSchedule(
  config: HeartbeatScheduleConfig,
  scheduleId: string,
  tenantId: string,
): Promise<HeartbeatScheduleRow | null> {
  OpaqueIdSchema.parse(scheduleId);

  const result = await config.pool.query<HeartbeatScheduleRow>(
    `SELECT * FROM heartbeat_schedules WHERE schedule_id = $1 AND tenant_id = $2`,
    [scheduleId, tenantId],
  );

  return result.rows[0] ?? null;
}

export async function listHeartbeatSchedules(
  config: HeartbeatScheduleConfig,
  tenantId: string,
  sessionId?: string,
): Promise<HeartbeatScheduleRow[]> {
  let query = `SELECT * FROM heartbeat_schedules WHERE tenant_id = $1`;
  const params: (string | number)[] = [tenantId];

  if (sessionId) {
    OpaqueIdSchema.parse(sessionId);
    query += ` AND session_id = $2`;
    params.push(sessionId);
  }

  query += ` ORDER BY created_at DESC`;

  const result = await config.pool.query<HeartbeatScheduleRow>(query, params);
  return result.rows;
}