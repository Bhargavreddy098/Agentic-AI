// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalCard } from "@asi/web/features/chat/ApprovalCard.js";
import { SubmissionController } from "@asi/web/lib/chat/submission.js";
import { ChatStore } from "@asi/web/lib/chat/store.js";
import { GatewayError } from "@asi/web/lib/gateway/http-client.js";
import { hydrateConversation, reduceConversation } from "@asi/web/lib/chat/reducer.js";
import { ConversationSnapshotSchema, UiApprovalRequestSchema, UiEventSchema, WorkspaceSessionSchema } from "../../../packages/contracts/src/ui/index.js";

const session = WorkspaceSessionSchema.parse({ workspaceId: "w1", displayName: "Demo", subjectId: "u1", allowedActions: [], demoMode: true, csrfToken: "csrf", limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } });
const snapshot = (sequence = 9) => ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: sequence, lastEventSequence: sequence, messages: [{ messageId: "m1", role: "assistant", createdAt: "2026-10-06T12:00:00Z", parts: [{ type: "text", partId: "p1", text: "hello" }] }], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: "running", effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: [] });
const delta = (sequence: number, deltaIndex: number, text: string, eventId = `e${sequence}`) => UiEventSchema.parse({ schemaVersion: 1, eventId, conversationId: "c1", sequence, occurredAt: "2026-10-06T12:00:00Z", eventType: "message.delta", payload: { messageId: "m1", partId: "p1", deltaIndex, text } });
const approval = (overrides: Record<string, unknown> = {}) => UiApprovalRequestSchema.parse({ interactionId: "i1", conversationId: "c1", runId: "r1", type: "approval", version: 2, approvalId: "a1", effectId: "f1", status: "pending", action: "Write file", target: "repo/notes.md", preview: "Synthetic preview", expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "owner", actionRef: "ref1", ...overrides });

afterEach(() => cleanup());

describe("recovery and race protection", () => {
  it("does not duplicate text when a reconnect replays the same delta index under a new event", () => {
    const once = reduceConversation(hydrateConversation(snapshot()), delta(10, 0, " world"));
    expect(once.snapshot.messages[0]?.parts[0]).toMatchObject({ text: "hello world" });
    const replayed = reduceConversation(once, delta(11, 0, " world", "replay"));
    expect(replayed.snapshot.messages[0]?.parts[0]).toMatchObject({ text: "hello world" });
    expect(replayed.snapshot.lastEventSequence).toBe(11);
  });

  it("coalesces a double approval decision into one command", async () => {
    const onDecide = vi.fn(() => new Promise<never>(() => {}));
    render(<ApprovalCard approval={approval()} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    fireEvent.click(screen.getByRole("button", { name: "Approve once" }));
    await waitFor(() => expect(onDecide).toHaveBeenCalledTimes(1));
  });

  it("treats an expired proposal as read-only and never submits a decision", () => {
    const onDecide = vi.fn();
    render(<ApprovalCard approval={approval({ expiresAt: "2000-01-01T00:00:00Z" })} onDecide={onDecide} />);
    expect(screen.queryByRole("button", { name: "Approve once" })).toBeNull();
    expect(screen.getByTestId("approval-a1").getAttribute("data-status")).toBe("expired");
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("rejects a send acknowledgement with the wrong command identity", async () => {
    const controller = new SubmissionController(vi.fn(async () => ({ commandId: "other", status: "applied" as const, revision: 4 })));
    await expect(controller.submit(() => ({ commandId: "command-1", clientMessageId: "message-1", expectedConversationRevision: 0, text: "hello", attachmentIds: [], requestedSkillIds: [] }))).rejects.toThrow(/identity mismatch/i);
  });

  it("refuses a recovery snapshot that does not cover the missing events", async () => {
    const getSnapshot = vi.fn().mockResolvedValueOnce(snapshot(9)).mockResolvedValue(snapshot(5));
    const subscribe = (): AsyncIterable<never> => ({ [Symbol.asyncIterator]: () => ({ next: async () => { throw new GatewayError(409, "expired cursor"); } }) });
    const store = new ChatStore({ getMe: async () => session, getSnapshot, subscribe } as never);
    await store.open("c1");
    await waitFor(() => expect(store.getSnapshot().connection).toBe("disconnected"));
    expect(store.getSnapshot().conversation?.snapshot.lastEventSequence).toBe(9);
    store.clear();
  });
});
