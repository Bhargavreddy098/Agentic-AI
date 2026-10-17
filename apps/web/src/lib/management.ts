import type { Interaction, UiApprovalRequest, UiCommandResult } from "@asi/contracts";
import { navigateToInteraction } from "./navigation.ts";

export type ManagementOutcome =
  | { kind: "navigate"; href: string }
  | { kind: "applied"; revision: number }
  | { kind: "error"; code: string; message: string };

export function handleManagementResult(result: UiCommandResult): ManagementOutcome {
  if (result.status === "approval_required") return { kind: "navigate", href: navigateToInteraction(result.conversationId, result.interactionId) };
  if (result.status === "applied") return { kind: "applied", revision: result.revision };
  return { kind: "error", code: result.error.code, message: result.error.safeMessage };
}

export function approvalForInteraction(interactions: Interaction[], interactionId: string): UiApprovalRequest | undefined {
  const found = interactions.find(item => item.interactionId === interactionId);
  return found?.type === "approval" ? found : undefined;
}
