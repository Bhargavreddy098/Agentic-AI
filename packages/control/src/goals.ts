import type { Pool } from "pg";
import { GoalRecordSchema, GoalProgressReportSchema, GoalTransitionSchema } from "@asi/contracts";
import type { GoalRecord, GoalProgressReport, GoalTransition, RunContext } from "@asi/contracts";
import { bindScope, transaction, checkContext, safeInteger } from "./runtime.js";
import type { ControlScope } from "./runtime.js";

export interface GoalRepository {
  createGoal(record: GoalRecord, context: RunContext): Promise<void>;
  getGoal(goalId: string): Promise<GoalRecord | null>;
  reviseGoal(record: GoalRecord, expectedRevision: number, context: RunContext): Promise<boolean>;
  appendProgress(report: GoalProgressReport, context: RunContext): Promise<void>;
  latestProgress(goalId: string): Promise<GoalProgressReport | null>;
  appendTransition(transition: GoalTransition, context: RunContext): Promise<void>;
}

function columns(record: GoalRecord): unknown[] {
  return [
    record.goalId,
    record.tenantId,
    record.revision,
    record.status,
    record.conversationId,
    record.objective,
    record.deadlineAt,
    record.owningRunId ?? null,
    record.latestVerificationRef ?? null,
    JSON.stringify(record),
  ];
}

export function createGoalRepository(pool: Pool, input?: ControlScope): GoalRepository {
  const scope = bindScope(input);
  return {
    createGoal: (record, context) => transaction(pool, scope, async client => {
      const parsed = GoalRecordSchema.parse(record);
      if (parsed.revision !== 1) throw new Error("A stored goal must start at revision 1");
      await checkContext(client, scope, context);
      const inserted = await client.query(
        "INSERT INTO goals(goal_id,tenant_id,revision,status,conversation_id,objective,deadline_at,owning_run_id,latest_verification_ref,record_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(goal_id,revision) DO NOTHING RETURNING goal_id",
        columns(parsed)
      );
      if (inserted.rows.length !== 1) throw new Error("Goal revision already exists");
    }),
    getGoal: goalId => transaction(pool, scope, async client => {
      const result = await client.query("SELECT record_json,status,latest_verification_ref FROM goals WHERE goal_id=$1 AND tenant_id=$2 ORDER BY revision DESC LIMIT 1", [goalId, scope.tenantId]);
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return GoalRecordSchema.parse({ ...(row.record_json as Record<string, unknown>), status: row.status, ...(row.latest_verification_ref === null ? {} : { latestVerificationRef: row.latest_verification_ref }) });
    }),
    reviseGoal: (record, expectedRevision, context) => transaction(pool, scope, async client => {
      const parsed = GoalRecordSchema.parse(record);
      safeInteger(expectedRevision, 1);
      if (parsed.revision !== expectedRevision + 1) throw new Error("Goal revision must advance by exactly one");
      await checkContext(client, scope, context);
      const current = await client.query("SELECT max(revision) AS revision FROM goals WHERE goal_id=$1 AND tenant_id=$2", [parsed.goalId, scope.tenantId]);
      if (current.rows[0].revision === null || safeInteger(current.rows[0].revision, 1) !== expectedRevision) return false;
      const inserted = await client.query(
        "INSERT INTO goals(goal_id,tenant_id,revision,status,conversation_id,objective,deadline_at,owning_run_id,latest_verification_ref,record_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT(goal_id,revision) DO NOTHING RETURNING goal_id",
        columns(parsed)
      );
      return inserted.rows.length === 1;
    }),
    appendProgress: (report, context) => transaction(pool, scope, async client => {
      const parsed = GoalProgressReportSchema.parse(report);
      await checkContext(client, scope, context);
      await client.query(
        "INSERT INTO goal_progress(progress_id,goal_id,tenant_id,revision,measured_at,display_status,report_json) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [parsed.progressId, parsed.goalId, scope.tenantId, parsed.goalRevision, parsed.measuredAt, parsed.displayStatus, JSON.stringify(parsed)]
      );
    }),
    latestProgress: goalId => transaction(pool, scope, async client => {
      const result = await client.query("SELECT report_json FROM goal_progress WHERE goal_id=$1 AND tenant_id=$2 ORDER BY measured_at DESC, progress_id DESC LIMIT 1", [goalId, scope.tenantId]);
      return result.rows[0] ? GoalProgressReportSchema.parse(result.rows[0].report_json) : null;
    }),
    appendTransition: (transition, context) => transaction(pool, scope, async client => {
      const parsed = GoalTransitionSchema.parse(transition);
      await checkContext(client, scope, context);
      await client.query(
        "INSERT INTO goal_transitions(transition_id,goal_id,tenant_id,revision,from_status,to_status,verification_ref,transitioned_at,transition_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
        [parsed.transitionId, parsed.goalId, scope.tenantId, parsed.goalRevision, parsed.fromStatus, parsed.toStatus, parsed.verificationRef ?? null, parsed.at, JSON.stringify(parsed)]
      );
      const updated = await client.query(
        "UPDATE goals SET status=$1,latest_verification_ref=coalesce($2,latest_verification_ref),updated_at=clock_timestamp() WHERE goal_id=$3 AND tenant_id=$4 AND revision=$5 RETURNING goal_id",
        [parsed.toStatus, parsed.verificationRef ?? null, parsed.goalId, scope.tenantId, parsed.goalRevision]
      );
      if (updated.rows.length !== 1) throw new Error("Goal revision not found for transition");
    }),
  };
}

export type { GoalRepository as GoalPort };
