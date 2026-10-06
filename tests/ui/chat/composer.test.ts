// @vitest-environment jsdom
import { createElement, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Composer from "../../../apps/web/src/features/chat/Composer.tsx";
import { ConversationSnapshotSchema } from "../../../packages/contracts/src/ui/index.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { ChatStore } from "../../../apps/web/src/lib/chat/store.js";
const session = { workspaceId: "w1", displayName: "Demo", subjectId: "u1", allowedActions: ["chat"], demoMode: true, csrfToken: "csrf", limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } };
const snapshot = ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: 0, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: "demo", usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] });
function mount(client: Partial<GatewayClient>, draft = "hello", active = false, onChange?: (text: string) => void) {
  const store = new ChatStore(client as GatewayClient);
  function Harness() { const [text, setText] = useState(draft); return createElement(Composer, { client: client as GatewayClient, submission: store.submissionFor("c1"), onCancel: runId => store.cancel(runId), snapshot: active ? { ...snapshot, activeRunId: "r1", runStatus: "waiting_approval" } : snapshot, session, draft: text, onDraft: value => { onChange?.(value); setText(value); }, onRefresh: async () => {} }); }
  return render(createElement(Harness));
}
afterEach(cleanup);
it("keeps Shift+Enter and IME editing, sends Enter once and disables blank messages", async () => {
  const sendMessage = vi.fn(async (_id: string, input: { commandId: string }) => ({ commandId: input.commandId, status: "applied" as const, revision: 1 }));
  mount({ sendMessage }); const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true }); fireEvent.keyDown(input, { key: "Enter", isComposing: true }); expect(sendMessage).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: "Enter" }); fireEvent.keyDown(input, { key: "Enter" });
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
});
it("does not clear another conversation draft after this composer unmounts", async () => {
  let acknowledge!: () => void;
  const sendMessage = vi.fn((_id: string, input: { commandId: string }) => new Promise(resolve => { acknowledge = () => resolve({ commandId: input.commandId, status: "applied", revision: 1 }); }));
  const onChange = vi.fn();
  const view = mount({ sendMessage: sendMessage as GatewayClient["sendMessage"] }, "private draft", false, onChange);
  fireEvent.click(screen.getByRole("button", { name: "Send" })); view.unmount(); acknowledge();
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(onChange).not.toHaveBeenCalled();
});
it("uses only ready attachment IDs and exposes quarantine until acknowledgement", async () => {
  let uploaded!: () => void;
  const sendMessage = vi.fn(async (_id: string, input: { commandId: string }) => ({ commandId: input.commandId, status: "applied" as const, revision: 1 }));
  mount({ sendMessage, beginUpload: async () => ({ uploadId: "up1", status: "uploading" }), uploadContent: () => new Promise<void>(resolve => { uploaded = resolve; }), completeUpload: async () => ({ uploadId: "up1", status: "ready", attachmentId: "attachment-1" }) });
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["demo"], "demo.txt", { type: "text/plain" })] } });
  await screen.findByText("demo.txt · uploading");
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  uploaded(); await screen.findByText("demo.txt · ready");
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("c1", expect.objectContaining({ attachmentIds: ["attachment-1"] })));
});
it("honors limits and waits for the server run event after cancellation", async () => {
  const cancelRun = vi.fn(async (_runId: string, commandId: string) => ({ commandId, status: "applied" as const, revision: 2 }));
  mount({ cancelRun }, "still editable", true);
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File([new Uint8Array(1001)], "large.txt")] } });
  await screen.findByText("large.txt: attachment exceeds the workspace limit.");
  expect((screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await screen.findByText("Cancellation requested; awaiting the run event.");
  expect(cancelRun).toHaveBeenCalledWith("r1", expect.any(String));
});
it("rejects excessive counts and shows a backend MIME denial without sending its ID", async () => {
  const beginUpload = vi.fn().mockResolvedValue({ uploadId: "blocked", status: "rejected", reason: "MIME blocked" });
  const sendMessage = vi.fn(async (_id: string, input: { commandId: string }) => ({ commandId: input.commandId, status: "applied" as const, revision: 1 }));
  mount({ beginUpload, sendMessage });
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["a"], "a.txt"), new File(["b"], "b.txt")] } });
  await screen.findByText("Attachment count exceeds the workspace limit."); expect(beginUpload).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["x"], "script.js", { type: "application/javascript" })] } });
  await screen.findByText("MIME blocked"); fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledWith("c1", expect.objectContaining({ attachmentIds: [] })));
});
it("waits for canonical revision catch-up before a new message can be sent", async () => {
  const sendMessage = vi.fn(async (_id: string, input: { commandId: string }) => ({ commandId: input.commandId, status: "applied" as const, revision: 4 }));
  mount({ sendMessage }); const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(""));
  fireEvent.change(input, { target: { value: "next message" } });
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
});
