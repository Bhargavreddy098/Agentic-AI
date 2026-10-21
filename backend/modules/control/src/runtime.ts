import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { OpaqueIdSchema } from "@asi/contracts";
import type { RunContext } from "@asi/contracts";

export interface ControlScope { tenantId: string; ownerId?: string }
export interface BoundScope { tenantId: string; ownerId: string }
export function bindScope(input?: ControlScope): BoundScope {
  const parsed = z.strictObject({ tenantId: OpaqueIdSchema, ownerId: OpaqueIdSchema.optional() }).parse(input);
  return { tenantId: parsed.tenantId, ownerId: parsed.ownerId ?? randomUUID() };
}
export function safeInteger(value: unknown, minimum = 0): number {
  if (typeof value !== "number" && !(typeof value === "string" && /^\d+$/.test(value))) throw new Error("Invalid persisted integer");
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum) throw new Error("Invalid persisted integer");
  return result;
}
export function boundedLimit(value: number): number { return z.number().int().min(1).max(1000).parse(value); }
export async function transaction<T>(pool: Pool, scope: BoundScope, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('asi.tenant_id',$1,true),set_config('asi.owner_id',$2,true)", [scope.tenantId, scope.ownerId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
export async function lockWriter(client: PoolClient, scope: BoundScope, runId: string, epoch?: number) {
  OpaqueIdSchema.parse(runId);
  if (epoch !== undefined) safeInteger(epoch, 1);
  const identity = await client.query("SELECT session_id FROM runs WHERE run_id=$1 AND tenant_id=$2", [runId, scope.tenantId]);
  if (identity.rows.length !== 1) return null;
  const sessionId = identity.rows[0].session_id;
  // All writers lock in the same session -> run -> lease order as claimSession.
  const session = await client.query("SELECT session_id FROM sessions WHERE session_id=$1 AND tenant_id=$2 FOR UPDATE", [sessionId, scope.tenantId]);
  if (session.rows.length !== 1) return null;
  const run = await client.query("SELECT * FROM runs WHERE run_id=$1 AND session_id=$2 AND tenant_id=$3 FOR UPDATE", [runId, sessionId, scope.tenantId]);
  if (run.rows.length !== 1) return null;
  const currentEpoch = safeInteger(run.rows[0].writer_epoch);
  if (currentEpoch === 0) return null; // Accepted runs have no writer until their first claim.
  if (epoch !== undefined && epoch !== currentEpoch) return null;
  const lease = await client.query("SELECT session_id FROM writer_leases WHERE session_id=$1 AND run_id=$2 AND tenant_id=$3 AND owner_id=$4 AND writer_epoch=$5 FOR UPDATE", [sessionId, runId, scope.tenantId, scope.ownerId, currentEpoch]);
  return lease.rows.length === 1 ? run.rows[0] : null;
}
export async function fence(client: PoolClient, scope: BoundScope, runId: string, epoch?: number) {
  const run = await lockWriter(client, scope, runId, epoch);
  if (!run) throw new Error("Stale writer, expired lease or inactive run");
  // A separate statement evaluates clock_timestamp after every row-lock wait.
  await client.query("SELECT m04_require_writer($1,$2,$3)", [runId, scope.tenantId, safeInteger(run.writer_epoch, 1)]);
  return run;
}
export async function checkContext(client: PoolClient, scope: BoundScope, context: RunContext): Promise<void> {
  if (context.budgetRef.tenantId !== scope.tenantId) throw new Error("Authenticated tenant mismatch");
  const run = await fence(client, scope, context.runId, context.writerEpoch);
  if (run.session_id !== context.sessionId || run.mode !== context.mode ||
      run.deadline_at.toISOString() !== context.deadlineAt || run.budget_account_id !== context.budgetRef.accountId ||
      (run.parent_run_id ?? undefined) !== context.parentRunId) throw new Error("Run context does not match canonical run");
  const root = await client.query("WITH RECURSIVE family AS (SELECT run_id,parent_run_id,budget_account_id,ARRAY[run_id] AS path FROM runs WHERE run_id=$1 AND tenant_id=$2 UNION ALL SELECT parent.run_id,parent.parent_run_id,parent.budget_account_id,family.path||parent.run_id FROM runs parent JOIN family ON parent.run_id=family.parent_run_id WHERE parent.tenant_id=$2 AND NOT parent.run_id=ANY(family.path) AND cardinality(family.path)<64) SELECT run_id FROM family WHERE run_id=$3 AND parent_run_id IS NULL AND budget_account_id=$4", [context.runId, scope.tenantId, context.budgetRef.rootRunId, context.budgetRef.accountId]);
  if (root.rows.length !== 1) throw new Error("Invalid root budget run");
}

