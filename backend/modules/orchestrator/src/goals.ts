import { randomUUID } from "node:crypto";
import { GoalSpecSchema, GoalRecordSchema, GoalProgressReportSchema, GoalTransitionSchema } from "@asi/contracts";
import type { GoalSpec, GoalRecord, GoalProgressReport, GoalTransition, RunContext, VerificationReport } from "@asi/contracts";

type GoalStatus = GoalRecord["status"];

// Owner port implemented by the control store (packages/control). The supervisor
// holds only this port, never the database driver.
export interface GoalStorePort {
  createGoal(record: GoalRecord, context: RunContext): Promise<void>;
  getGoal(goalId: string): Promise<GoalRecord | null>;
  reviseGoal(record: GoalRecord, expectedRevision: number, context: RunContext): Promise<boolean>;
  appendProgress(report: GoalProgressReport, context: RunContext): Promise<void>;
  latestProgress(goalId: string): Promise<GoalProgressReport | null>;
  appendTransition(transition: GoalTransition, context: RunContext): Promise<void>;
}

export interface GoalServiceConfig {
  store: GoalStorePort;
  now?: () => Date;
  identify?: () => string;
}

export interface GoalTransitionInput {
  goalId: string;
  toStatus: GoalStatus;
  expectedRevision: number;
  verification?: VerificationReport;
}

function isCurrentVerification(goal: GoalRecord, verification: VerificationReport | null | undefined): verification is VerificationReport {
  return Boolean(verification && verification.goalId === goal.goalId && verification.goalRevision === goal.revision);
}

export function createGoalService(config: GoalServiceConfig) {
  const now = config.now ?? (() => new Date());
  const identify = config.identify ?? (() => randomUUID());
  const timestamp = () => now().toISOString();

  function assertRunBinding(goal: GoalSpec, context: RunContext): void {
    if (goal.tenantId !== context.budgetRef.tenantId) throw new Error("Goal tenant must match the authenticated run tenant");
    if (context.goalRef !== undefined && context.goalRef !== goal.goalId) throw new Error("Run context is bound to a different goal");
  }

  async function createGoal(input: GoalSpec, context: RunContext): Promise<GoalRecord> {
    const spec = GoalSpecSchema.parse(input);
    if (spec.revision !== 1) throw new Error("A new goal must start at revision 1");
    assertRunBinding(spec, context);
    const record = GoalRecordSchema.parse({ ...spec, status: "ready", owningRunId: context.runId });
    await config.store.createGoal(record, context);
    return record;
  }

  async function reviseGoal(input: GoalSpec, expectedRevision: number, context: RunContext): Promise<GoalRecord> {
    const spec = GoalSpecSchema.parse(input);
    if (spec.revision !== expectedRevision + 1) throw new Error("Goal revision must advance by exactly one");
    assertRunBinding(spec, context);
    const record = GoalRecordSchema.parse({ ...spec, status: "ready", owningRunId: context.runId });
    const applied = await config.store.reviseGoal(record, expectedRevision, context);
    if (!applied) throw new Error(`Stale goal revision: expected revision ${expectedRevision}`);
    return record;
  }

  function assertVerifiedTransition(goal: GoalRecord, verification: VerificationReport | undefined): VerificationReport {
    if (!verification) throw new Error("A verified transition requires a matching VerificationReport");
    if (!isCurrentVerification(goal, verification)) throw new Error("Verification report does not match the goal and revision");
    for (const criterion of goal.criteria) {
      if (!criterion.required) continue;
      const result = verification.criterionResults.find(entry => entry.criterionId === criterion.criterionId);
      // Unknown (null) or unsatisfied evidence can never authorize a verified transition.
      if (!result || result.satisfied !== true) throw new Error(`Final verified transition denied: required criterion ${criterion.criterionId} is unknown or unsatisfied`);
    }
    return verification;
  }

  async function transitionGoal(input: GoalTransitionInput, context: RunContext): Promise<GoalRecord> {
    const goal = await config.store.getGoal(input.goalId);
    if (!goal) throw new Error("Goal not found");
    if (goal.tenantId !== context.budgetRef.tenantId) throw new Error("Goal tenant must match the authenticated run tenant");
    if (goal.revision !== input.expectedRevision) throw new Error("Stale goal revision");
    const verification = input.toStatus === "verified" ? assertVerifiedTransition(goal, input.verification) : input.verification;
    const transition = GoalTransitionSchema.parse({
      schemaVersion: 1,
      transitionId: identify(),
      goalId: goal.goalId,
      goalRevision: goal.revision,
      expectedRevision: input.expectedRevision,
      fromStatus: goal.status,
      toStatus: input.toStatus,
      ...(isCurrentVerification(goal, verification) ? { verificationRef: verification.reportId } : {}),
      at: timestamp(),
      by: context.runId,
    });
    await config.store.appendTransition(transition, context);
    return { ...goal, status: input.toStatus, ...(transition.verificationRef ? { latestVerificationRef: transition.verificationRef } : {}) };
  }

  function measureGoalProgress(goal: GoalRecord, verification: VerificationReport | null): GoalProgressReport {
    const current = isCurrentVerification(goal, verification) ? verification : null;
    const metrics = goal.criteria.map(criterion => {
      const result = current?.criterionResults.find(entry => entry.criterionId === criterion.criterionId);
      return {
        metricId: criterion.criterionId,
        criterionId: criterion.criterionId,
        description: criterion.description,
        evaluatorId: criterion.evaluatorId,
        required: criterion.required,
        satisfied: result ? result.satisfied : null,
        evidenceRefs: result ? result.evidenceRefs : [],
        safeReason: result ? result.safeReason : "No current verification result for this criterion.",
      };
    });
    const required = metrics.filter(metric => metric.required);
    const displayStatus = required.length === 0
      ? "on_track"
      : required.every(metric => metric.satisfied === true)
        ? "achieved"
        : required.some(metric => metric.satisfied === false)
          ? "unmet"
          : "unknown";
    const status: GoalStatus = displayStatus === "achieved" ? "verified" : displayStatus === "unmet" ? "unmet" : goal.status;
    return GoalProgressReportSchema.parse({
      schemaVersion: 1,
      progressId: identify(),
      goalId: goal.goalId,
      goalRevision: goal.revision,
      status,
      displayStatus,
      measuredAt: timestamp(),
      metrics,
      ...(current ? { verificationRef: current.reportId } : {}),
      limitations: displayStatus === "achieved" ? [] : ["Progress reflects the available verification results only."],
    });
  }

  async function recordProgress(goal: GoalRecord, verification: VerificationReport | null, context: RunContext): Promise<GoalProgressReport> {
    const report = measureGoalProgress(goal, verification);
    await config.store.appendProgress(report, context);
    return report;
  }

  return { createGoal, reviseGoal, transitionGoal, measureGoalProgress, recordProgress };
}

export type GoalService = ReturnType<typeof createGoalService>;
