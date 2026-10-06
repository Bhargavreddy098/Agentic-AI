import { expect, it, vi } from "vitest";
import { SubmissionController } from "../../../apps/web/src/lib/chat/submission.js";
const input = { commandId: "command-1", clientMessageId: "message-1", expectedConversationRevision: 0, text: "hello", attachmentIds: [], requestedSkillIds: [] };
it("shares one in-flight submission and retries the identical command after transport failure", async () => {
  const send = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue({ commandId: "command-1", status: "applied", revision: 4 });
  const controller = new SubmissionController(send);
  await expect(controller.submit(() => input)).rejects.toThrow("lost response");
  expect(controller.pending?.commandId).toBe("command-1");
  await controller.submit(() => ({ ...input, commandId: "new", text: "edited" }));
  expect(send.mock.calls[0]?.[0]).toEqual(send.mock.calls[1]?.[0]);
  expect(controller.pending).toBeNull();
});
it("coalesces double-clicks while the Gateway acknowledgement is unresolved", async () => {
  let resolve!: (value: unknown) => void;
  const send = vi.fn(() => new Promise(resolvePromise => { resolve = resolvePromise; }));
  const controller = new SubmissionController(send as ConstructorParameters<typeof SubmissionController>[0]);
  const first = controller.submit(() => input), second = controller.submit(() => input);
  expect(first).toBe(second); expect(send).toHaveBeenCalledTimes(1);
  resolve({ commandId: "command-1", status: "applied", revision: 4 }); await first;
});
