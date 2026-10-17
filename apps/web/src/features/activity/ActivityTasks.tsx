"use client";
import type { Interaction, TaskView, UsageView } from "@asi/contracts";
import { canonicalDecision, decisionHref } from "./activity";
import { ActivityUsage } from "./ActivityUsage";

const STATUS_LABELS: Record<TaskView["status"], string> = { queued: "Queued", running: "Running", completed: "Completed", failed: "Failed", cancelled: "Cancelled", unknown: "Unknown" };

export function ActivityTasks({ tasks, interactions = [], usage = null, onCancel, onOpenDecision }: {
  tasks: TaskView[];
  interactions?: Interaction[];
  usage?: UsageView | null;
  onCancel?: (task: TaskView) => void;
  onOpenDecision?: (href: string) => void;
}) {
  const decision = canonicalDecision(interactions);
  return (
    <div className="activity-tasks" data-testid="activity-tasks">
      {usage ? <ActivityUsage usage={usage} /> : null}
      {tasks.length === 0 ? <p className="activity-empty" data-testid="activity-empty">No activity to show.</p> : (
        <ul className="activity-list">
          {tasks.map(task => (
            <li key={task.taskId} className="activity-row" data-testid={`task-${task.taskId}`} data-status={task.status} data-run={task.runId}>
              <span className="task-status">{STATUS_LABELS[task.status]}</span>
              <span className="task-summary">{task.summary}</span>
              <span className="task-receipts" data-testid={`task-receipts-${task.taskId}`}>{task.evidenceRefs.length > 0 ? task.evidenceRefs.join(", ") : "No receipts recorded"}</span>
              {task.allowedActions.includes("run.cancel") ? <button type="button" onClick={() => onCancel?.(task)}>Cancel run</button> : null}
            </li>
          ))}
        </ul>
      )}
      {decision ? <button type="button" className="activity-decision" data-testid={`decision-${decision.interactionId}`} onClick={() => onOpenDecision?.(decisionHref(decision))}>Open pending decision</button> : null}
    </div>
  );
}

export default ActivityTasks;
