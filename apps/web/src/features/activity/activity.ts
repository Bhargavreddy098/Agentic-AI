import type { Interaction, TaskView, UiCommandResult } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { navigateToInteraction } from "../../lib/navigation";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export const TERMINAL_TASK_STATUSES = ["completed", "failed", "cancelled"] as const;
export type TerminalTaskStatus = (typeof TERMINAL_TASK_STATUSES)[number];

function isTerminal(status: TaskView["status"]): boolean {
  return (TERMINAL_TASK_STATUSES as readonly string[]).includes(status);
}

export function filterTasks(tasks: TaskView[], status?: string): TaskView[] {
  if (!status) return tasks;
  return tasks.filter(task => task.status === status);
}

export function paginateTasks(tasks: TaskView[], cursor: number, limit: number): { items: TaskView[]; nextCursor: number | null } {
  const items = tasks.slice(cursor, cursor + limit);
  const nextCursor = cursor + limit < tasks.length ? cursor + limit : null;
  return { items, nextCursor };
}

export function usageLabel(value: number | null | undefined, unit: string): string {
  return value === null || value === undefined ? "Not reported" : `${value} ${unit}`;
}

export function canonicalDecision(interactions: Interaction[]): Interaction | null {
  const byId = new Map<string, Interaction>();
  for (const item of interactions) {
    if (item.status !== "pending") continue;
    const existing = byId.get(item.interactionId);
    if (!existing || item.version > existing.version) byId.set(item.interactionId, item);
  }
  const ordered = [...byId.values()].sort((a, b) => b.version - a.version);
  return ordered[0] ?? null;
}

export function decisionHref(interaction: Interaction): string {
  return navigateToInteraction(interaction.conversationId, interaction.interactionId);
}

export function reconcileTasks(existing: TaskView[], incoming: TaskView): TaskView[] {
  const index = existing.findIndex(task => task.taskId === incoming.taskId);
  if (index === -1) return [...existing, incoming];
  const previous = existing[index]!;
  if (incoming.version <= previous.version) return existing;
  if (isTerminal(previous.status) && !isTerminal(incoming.status)) return existing;
  const next = existing.slice();
  next[index] = incoming;
  return next;
}

export async function cancelTask(client: Pick<GatewayClient, "cancelRun">, task: TaskView, commandId: string): Promise<ManagementOutcome> {
  const result: UiCommandResult = await client.cancelRun(task.runId, commandId);
  return handleManagementResult(result);
}
