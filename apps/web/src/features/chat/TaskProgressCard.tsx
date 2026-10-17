"use client";
import { useState } from "react";
import type { TaskView } from "@asi/contracts";
import { bounded, SUMMARY_LIMIT } from "../../lib/artifacts";

const TASK_LABELS: Record<TaskView["status"], string> = { queued: "Queued", running: "Running", completed: "Completed", failed: "Failed", cancelled: "Cancelled", unknown: "Unknown outcome" };

export function TaskProgressCard({ task, className }: { task: TaskView; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const output = bounded(task.summary, SUMMARY_LIMIT);
  const titleId = `task-title-${task.taskId}`;
  return <section className={className ? `task-card ${className}` : "task-card"} data-testid={`task-${task.taskId}`} data-status={task.status} data-run-id={task.runId} aria-labelledby={titleId}>
    <h3 id={titleId}>Task</h3>
    <p className="task-status" role="status" aria-live="polite">{TASK_LABELS[task.status]}</p>
    <p className="task-summary">{expanded ? task.summary : output.text}{output.truncated && !expanded ? "…" : ""}</p>
    {output.truncated ? <button type="button" onClick={() => setExpanded(value => !value)}>{expanded ? "Hide full summary" : "Show full summary"}</button> : null}
    {task.evidenceRefs.length > 0 ? <ul className="task-evidence">{task.evidenceRefs.map(reference => <li key={reference}>Evidence {reference}</li>)}</ul> : null}
  </section>;
}
export default TaskProgressCard;
