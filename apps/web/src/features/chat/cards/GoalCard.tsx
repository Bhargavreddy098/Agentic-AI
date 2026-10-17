"use client";
import type { GoalView, VerificationView } from "@asi/contracts";

const STATUS_LABELS: Record<GoalView["status"], string> = {
  draft: "Draft",
  ready: "Ready",
  running: "In progress",
  waiting_input: "Waiting for input",
  waiting_approval: "Waiting for approval",
  suspended: "Suspended",
  verified: "Goal achieved",
  unmet: "Goal not met",
  cancelled: "Cancelled",
  failed: "Failed",
};

type Display = "achieved" | "unmet" | "unknown";

function displayStatus(goal: GoalView, verification: VerificationView | null): Display {
  const results = verification ? verification.criterionResults : [];
  const required = goal.criteria.filter(criterion => criterion.required);
  if (required.length === 0) return goal.status === "verified" ? "achieved" : "unknown";
  const satisfiedFor = (criterionId: string): boolean | null => results.find(result => result.criterionId === criterionId)?.satisfied ?? null;
  if (required.every(criterion => satisfiedFor(criterion.criterionId) === true)) return "achieved";
  if (required.some(criterion => satisfiedFor(criterion.criterionId) === false)) return "unmet";
  return goal.status === "unmet" ? "unmet" : "unknown";
}

const DISPLAY_LABELS: Record<Display, string> = {
  achieved: "Goal achieved",
  unmet: "Goal not met",
  unknown: "Goal progress not determined",
};

function criterionLabel(satisfied: boolean | null): string {
  if (satisfied === true) return "Satisfied";
  if (satisfied === false) return "Not satisfied";
  return "Not determined";
}

export function GoalCard({ goal, verification = null, className }: { goal: GoalView; verification?: VerificationView | null; className?: string }) {
  const current = verification && verification.goalId === goal.goalId && verification.goalRevision === goal.revision ? verification : null;
  const display = displayStatus(goal, current);
  const titleId = `goal-title-${goal.goalId}`;
  return <section className={className ? `goal-card ${className}` : "goal-card"} data-testid={`goal-${goal.goalId}`} data-status={display} data-goal-id={goal.goalId} data-run-id={goal.runId} aria-labelledby={titleId}>
    <h3 id={titleId}>Goal</h3>
    <p className="goal-objective">{goal.objective}</p>
    <p className="goal-status" role="status" aria-live="polite">{DISPLAY_LABELS[display]}</p>
    <ul className="goal-criteria">
      {goal.criteria.map(criterion => {
        const satisfied = current ? current.criterionResults.find(result => result.criterionId === criterion.criterionId)?.satisfied ?? null : null;
        return <li key={criterion.criterionId} data-criterion-id={criterion.criterionId} data-satisfied={satisfied === null ? "unknown" : String(satisfied)} data-required={String(criterion.required)}>
          <span className="goal-criterion-description">{criterion.description}</span>
          <span className="goal-criterion-result">{criterionLabel(satisfied)}</span>
        </li>;
      })}
    </ul>
    <p className="goal-status-detail">{STATUS_LABELS[goal.status]}</p>
  </section>;
}
export default GoalCard;
