// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalCard } from "../../../apps/web/src/features/chat/ApprovalCard.tsx";
import { ApprovalDecisionInputSchema, UiApprovalRequestSchema, type UiApprovalRequest, type UiCommandResult } from "../../../packages/contracts/src/ui/index.js";
import { GatewayError } from "../../../apps/web/src/lib/gateway/http-client.ts";

const makeApproval = (overrides: Partial<UiApprovalRequest> = {}): UiApprovalRequest => UiApprovalRequestSchema.parse({
  interactionId: "i1", conversationId: "c1", runId: "r1", version: 1, type: "approval", approvalId: "a1", effectId: "e1",
  status: "pending", action: "Simulated document read", target: "Synthetic example document", preview: "No file, network or provider action will occur.",
  expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: "bound-1", ...overrides
});
const applied = async (_id: string, input: { commandId: string }): Promise<UiCommandResult> => ({ commandId: input.commandId, status: "applied", revision: 2 });
afterEach(cleanup);

describe("ApprovalCard decision transport", () => {
  it("sends only approvalId, decision, expectedVersion and commandId", async () => {
    const decideApproval = vi.fn(applied);
    render(<ApprovalCard approval={makeApproval()} onDecide={(id, input) => decideApproval(id, input)} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await waitFor(() => expect(decideApproval).toHaveBeenCalledTimes(1));
    const [id, input] = decideApproval.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe("a1");
    expect(Object.keys(input).sort()).toEqual(["commandId", "decision", "expectedVersion"]);
    expect(input.decision).toBe("approve");
    expect(input.expectedVersion).toBe(1);
    expect(ApprovalDecisionInputSchema.parse(input)).toEqual(input);
  });

  it("sends a reject decision through the same reviewed schema", async () => {
    const decideApproval = vi.fn(applied);
    render(<ApprovalCard approval={makeApproval()} onDecide={(id, input) => decideApproval(id, input)} />);
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(decideApproval).toHaveBeenCalledTimes(1));
    expect((decideApproval.mock.calls[0]![1] as { decision: string }).decision).toBe("reject");
  });

  it("disables controls while submitting and never claims the action completed", async () => {
    let resolve: (() => void) | null = null;
    const onDecide = vi.fn((_id: string, input: { commandId: string }) => new Promise<UiCommandResult>(settle => { resolve = () => settle({ commandId: input.commandId, status: "applied", revision: 2 }); }));
    render(<ApprovalCard approval={makeApproval()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await screen.findByText("Recording the decision…");
    expect(screen.getByRole("button", { name: "Approve once" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    resolve!();
    await screen.findByText("Decision recorded; awaiting the run.");
    expect(screen.queryByText(/action completed|completed/i)).toBeNull();
    expect(onDecide).toHaveBeenCalledTimes(1);
  });
});

describe("ApprovalCard authority guards", () => {
  it("cannot approve an expired or already-decided proposal from stale props", () => {
    cleanup();
    render(<ApprovalCard approval={makeApproval({ status: "approved" })} onDecide={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Approve once" })).toBeNull();
    expect(screen.getByTestId("approval-a1")).toHaveAttribute("data-status", "approved");
    cleanup();
    render(<ApprovalCard approval={makeApproval({ expiresAt: "2020-01-01T00:00:00Z" })} onDecide={vi.fn()} now={() => Date.parse("2026-10-06T12:00:00Z")} />);
    expect(screen.queryByRole("button", { name: "Approve once" })).toBeNull();
    expect(screen.getByTestId("approval-a1")).toHaveAttribute("data-status", "expired");
  });

  it("refreshes canonical status after a transport failure and retries the same command identity", async () => {
    const onDecide = vi.fn().mockRejectedValueOnce(new GatewayError(403, "forbidden")).mockImplementation(applied);
    const refreshStatus = vi.fn(async () => makeApproval());
    render(<ApprovalCard approval={makeApproval()} onDecide={onDecide} refreshStatus={refreshStatus} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await screen.findByText("Status refreshed; retry submits the same decision.");
    expect(refreshStatus).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(2));
    expect((onDecide.mock.calls[0]![1] as { commandId: string }).commandId).toBe((onDecide.mock.calls[1]![1] as { commandId: string }).commandId);
  });

  it("recovers from a conflict with a fresh request and reports an expired server clock", async () => {
    const onChanged = vi.fn();
    const onDecide = vi.fn()
      .mockResolvedValueOnce({ commandId: "x", status: "conflict", error: { code: "INVALID_INPUT", safeMessage: "changed", retryable: false } })
      .mockImplementationOnce(applied);
    render(<ApprovalCard approval={makeApproval()} onDecide={onDecide} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await screen.findByText("This proposal changed; the latest version is shown.");
    expect(onChanged).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(2));
    expect((onDecide.mock.calls[1]![1] as { commandId: string }).commandId).not.toBe((onDecide.mock.calls[0]![1] as { commandId: string }).commandId);
    cleanup();
    const expired = vi.fn().mockResolvedValueOnce({ commandId: "x", status: "rejected", error: { code: "POLICY_DENIED", safeMessage: "Proposal expired.", retryable: false } });
    render(<ApprovalCard approval={makeApproval()} onDecide={expired} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await screen.findByText("Proposal expired.");
    expect(screen.queryByText("Decision recorded; awaiting the run.")).toBeNull();
  });
});
