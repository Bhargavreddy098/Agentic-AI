import type { MemorySearchInput, MemoryView, Page, UiCommandResult, UiMutationCommand } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { handleManagementResult, type ManagementOutcome } from "../../lib/management";

export const MEMORY_SCOPES = ["Global", "Role", "Private"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export function narrowScopes(requested: readonly MemoryScope[], authorized: readonly MemoryScope[]): MemoryScope[] {
  const allowed = new Set(authorized);
  return requested.filter(scope => allowed.has(scope));
}

export function availableScopes(authorized: readonly MemoryScope[]): MemoryScope[] {
  return MEMORY_SCOPES.filter(scope => authorized.includes(scope));
}

export function confidenceLabel(confidence: number): "Confirmed" | "Uncertain" | "Hypothesis" {
  if (confidence >= 0.75) return "Confirmed";
  if (confidence >= 0.4) return "Uncertain";
  return "Hypothesis";
}

export function memoryLabels(memory: MemoryView, contradicted = false): string[] {
  const labels = [memory.sourceIds.length > 0 ? `Sources: ${memory.sourceIds.length}` : "Sources: none", `Confidence: ${confidenceLabel(memory.confidence)}`];
  if (contradicted) labels.push("Contradiction flagged");
  return labels;
}

export function resetOnWorkspaceChange<T>(state: { workspaceId: string; page: Page<T> | null }, workspaceId: string): { workspaceId: string; page: Page<T> | null } {
  return state.workspaceId === workspaceId ? state : { workspaceId, page: null };
}

export function searchMemory(client: Pick<GatewayClient, "queryMemory">, input: MemorySearchInput): Promise<Page<MemoryView>> {
  return client.queryMemory(input);
}

export type MemoryCommand = Extract<UiMutationCommand, { type: "memory.correct" | "memory.delete" }>;

export async function submitMemoryCommand(client: Pick<GatewayClient, "submitCommand">, command: MemoryCommand, onNavigate: (href: string) => void): Promise<ManagementOutcome> {
  const result: UiCommandResult = await client.submitCommand(command);
  const outcome = handleManagementResult(result);
  if (outcome.kind === "navigate") onNavigate(outcome.href);
  return outcome;
}

export const correctMemory = (client: Pick<GatewayClient, "submitCommand">, memory: MemoryView, value: string, onNavigate: (href: string) => void) => submitMemoryCommand(client, { commandId: crypto.randomUUID(), expectedRevision: memory.revision, type: "memory.correct", memoryId: memory.memoryId, value }, onNavigate);
export const deleteMemory = (client: Pick<GatewayClient, "submitCommand">, memory: MemoryView, onNavigate: (href: string) => void) => submitMemoryCommand(client, { commandId: crypto.randomUUID(), expectedRevision: memory.revision, type: "memory.delete", memoryId: memory.memoryId }, onNavigate);
