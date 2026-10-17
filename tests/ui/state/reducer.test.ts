import { expect, it } from "vitest";
import { ConversationSnapshotSchema, UiEventSchema } from "../../../packages/contracts/src/ui/index.js";
import { hydrateConversation, reduceConversation } from "@asi/web/lib/chat/reducer.js";

export const snapshot = (conversationId = "c1") => ConversationSnapshotSchema.parse({ conversationId, workspaceId: "w1", revision: 9, lastEventSequence: 9, messages: [{ messageId: "m1", role: "assistant", createdAt: "2026-10-06T12:00:00Z", parts: [{ type: "text", partId: "p1", text: "hello" }] }], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: "running", effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] });
const delta = (sequence: number, conversationId = "c1") => UiEventSchema.parse({ schemaVersion: 1, eventId: `e${sequence}`, conversationId, sequence, occurredAt: "2026-10-06T12:00:00Z", eventType: "message.delta", payload: { messageId: "m1", partId: "p1", deltaIndex: 0, text: " world" } });
it("applies sequence 10 once and detects a missing sequence without appending", () => {
  const initial = hydrateConversation(snapshot());
  const once = reduceConversation(initial, delta(10));
  expect(reduceConversation(once, delta(10))).toBe(once);
  expect(once.snapshot.messages[0]?.parts[0]).toMatchObject({ text: "hello world" });
  const gap = reduceConversation(once, delta(12));
  expect(gap.needsResync).toBe(true);
  expect(gap.snapshot).toEqual(once.snapshot);
});
it("ignores late events from a different chat and deduplicates delta indices", () => {
  const initial = hydrateConversation(snapshot("c2"));
  expect(reduceConversation(initial, delta(10))).toBe(initial);
  const once = reduceConversation(hydrateConversation(snapshot()), delta(10));
  const duplicatePayload = reduceConversation(once, delta(11));
  expect(duplicatePayload.snapshot.messages[0]?.parts[0]).toMatchObject({ text: "hello world" });
  expect(duplicatePayload.snapshot.lastEventSequence).toBe(11);
});
it("does not reopen a resolved approval with a stale request version", () => {
  const proposal = { interactionId: "i1", conversationId: "c1", runId: "r1", type: "approval", version: 2, approvalId: "a1", effectId: "f1", status: "approved", action: "Read", target: "Demo", preview: "Synthetic", expiresAt: "2099-01-01T00:00:00Z", requiredActorRole: "user", actionRef: "ref1" };
  const initial = hydrateConversation(ConversationSnapshotSchema.parse({ ...snapshot(), interactions: [proposal] }));
  const stale = UiEventSchema.parse({ schemaVersion: 1, eventId: "stale", conversationId: "c1", sequence: 10, occurredAt: "2026-10-06T12:00:00Z", eventType: "approval.requested", payload: { ...proposal, status: "pending", version: 1 } });
  expect(reduceConversation(initial, stale).snapshot.interactions[0]?.status).toBe("approved");
});
