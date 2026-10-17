// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { handleManagementResult, approvalForInteraction } from "../../../apps/web/src/lib/management.ts";
import { navigateToInteraction } from "../../../apps/web/src/lib/navigation.ts";
import { ApprovalCard } from "../../../apps/web/src/features/chat/ApprovalCard.tsx";
import { UiApprovalRequestSchema, ClarificationRequestSchema, type Interaction } from "../../../packages/contracts/src/ui/index.js";

const approval = UiApprovalRequestSchema.parse({
  interactionId: "i1", conversationId: "c1", runId: "r1", version: 1, type: "approval", approvalId: "a1", effectId: "e1",
  status: "pending", action: "Simulated connection", target: "Synthetic connector", preview: "No real effect occurs.",
  expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: "bound-1"
});
const clarification = ClarificationRequestSchema.parse({
  interactionId: "i2", conversationId: "c1", runId: "r1", version: 1, type: "clarification", questionId: "q1",
  status: "pending", prompt: "Which option?", options: [{ optionId: "yes", label: "Yes" }], allowFreeText: false, allowMultiple: false, required: true
});
afterEach(cleanup);

describe("management result handling", () => {
  it("navigates a Skills/Models/Memory approval_required response to the exact owning Chat", () => {
    for (const section of ["skill", "model", "memory"]) {
      const result = { commandId: "cmd", status: "approval_required" as const, revision: 0, conversationId: `conv-${section}`, interactionId: `inter-${section}` };
      const outcome = handleManagementResult(result);
      expect(outcome).toEqual({ kind: "navigate", href: `/chat/conv-${section}?interaction=inter-${section}` });
      expect(outcome).toEqual({ kind: "navigate", href: navigateToInteraction(`conv-${section}`, `inter-${section}`) });
    }
  });

  it("reports applied and failed commands without inventing a decision control", () => {
    expect(handleManagementResult({ commandId: "c", status: "applied", revision: 3 })).toEqual({ kind: "applied", revision: 3 });
    expect(handleManagementResult({ commandId: "c", status: "rejected", error: { code: "POLICY_DENIED", safeMessage: "Denied.", retryable: false } })).toEqual({ kind: "error", code: "POLICY_DENIED", message: "Denied." });
  });

  it("resolves exactly one canonical approval interaction and no second card", () => {
    const interactions: Interaction[] = [clarification, approval];
    const found = approvalForInteraction(interactions, "i1");
    expect(found).toEqual(approval);
    expect(approvalForInteraction(interactions, "missing")).toBeUndefined();
    expect(approvalForInteraction(interactions, "i2")).toBeUndefined();
    render(<ApprovalCard approval={found!} onDecide={async (_id, input) => ({ commandId: input.commandId, status: "applied", revision: 1 })} />);
    expect(document.querySelectorAll('section[data-testid^="approval-"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Approve once" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });
});
