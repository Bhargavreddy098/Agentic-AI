import { expect, it, vi } from "vitest";
import { ChatStore } from "../../../apps/web/src/lib/chat/store.js";
import { awaitUpload } from "../../../apps/web/src/lib/chat/uploads.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { ConversationSnapshotSchema } from "../../../packages/contracts/src/ui/index.js";
const snapshot = (id: string) => ConversationSnapshotSchema.parse({ conversationId: id, workspaceId: "w1", revision: 0, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: [] });
const input = { commandId: "original", clientMessageId: "original-message", expectedConversationRevision: 0, text: "hello", attachmentIds: [], requestedSkillIds: [] };
it("preserves uncertain submission identity across navigation and clears only its owning draft", async () => {
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error("lost acknowledgement")).mockResolvedValue({ commandId: "original", status: "applied", revision: 4 });
  const subscribe = async function* () { return; yield {}; };
  const store = new ChatStore({ sendMessage, subscribe, getMe: async () => ({ workspaceId: "w1", subjectId: "u1" }), getSnapshot: async (id: string) => snapshot(id) } as unknown as GatewayClient);
  try {
    await store.open("c1"); store.setDraft("hello");
    const submission = store.submissionFor("c1"); await expect(submission.submit(() => input)).rejects.toThrow();
    await store.open("c2"); store.setDraft("other draft"); await store.open("c1");
    expect(store.submissionFor("c1")).toBe(submission);
    await submission.submit(() => ({ ...input, commandId: "replacement" }));
    expect(sendMessage.mock.calls[0]?.[1]).toEqual(sendMessage.mock.calls[1]?.[1]);
    expect(store.getSnapshot().draft).toBe("");
    await store.open("c2"); expect(store.getSnapshot().draft).toBe("other draft");
  } finally { store.clear(); }
});
it("binds cancellation retries to the run and checks acknowledgement identity", async () => {
  let incorrect = true;
  const cancelRun = vi.fn(async (_run: string, commandId: string) => ({ commandId: incorrect ? "wrong" : commandId, status: "applied" as const, revision: 1 }));
  const store = new ChatStore({ cancelRun } as unknown as GatewayClient);
  await expect(store.cancel("r1")).rejects.toThrow("identity mismatch"); store.disconnect(); incorrect = false;
  await store.cancel("r2"); await store.cancel("r1");
  expect(cancelRun.mock.calls[0]?.[1]).toBe(cancelRun.mock.calls[2]?.[1]);
  expect(cancelRun.mock.calls[1]?.[1]).not.toBe(cancelRun.mock.calls[0]?.[1]); store.clear();
});
it("continues delayed scan states to ready/rejected and bounds pending scans without inventing readiness", async () => {
  const update = vi.fn(), signal = new AbortController().signal;
  const getUpload = vi.fn().mockResolvedValueOnce({ uploadId: "up1", status: "scanning" }).mockResolvedValueOnce({ uploadId: "up1", status: "ready", attachmentId: "a1" });
  expect(await awaitUpload({ getUpload }, { uploadId: "up1", status: "scanning" }, signal, update, 3, 0)).toMatchObject({ status: "ready", attachmentId: "a1" });
  expect(await awaitUpload({ getUpload: async () => ({ uploadId: "up1", status: "rejected", reason: "Digest rejected" }) }, { uploadId: "up1", status: "scanning" }, signal, update, 2, 0)).toMatchObject({ status: "rejected" });
  const pending = vi.fn().mockResolvedValue({ uploadId: "up1", status: "scanning" });
  expect(await awaitUpload({ getUpload: pending }, { uploadId: "up1", status: "scanning" }, signal, update, 2, 0)).toMatchObject({ status: "scanning", reason: expect.stringContaining("still pending") });
  expect(pending).toHaveBeenCalledTimes(2);
  await expect(awaitUpload({ getUpload: async () => ({ uploadId: "other", status: "ready", attachmentId: "a2" }) }, { uploadId: "up1", status: "scanning" }, signal, update)).rejects.toThrow("ownership mismatch");
});
