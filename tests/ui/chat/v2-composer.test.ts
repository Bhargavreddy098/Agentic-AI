// @vitest-environment jsdom
import { createElement, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Composer from "../../../apps/web/src/features/chat/Composer.tsx";
import { ConversationSnapshotSchema, SendMessageInputSchema } from "../../../packages/contracts/src/ui/index.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { ChatStore } from "../../../apps/web/src/lib/chat/store.js";

const session = { workspaceId: "w1", displayName: "Demo", subjectId: "u1", allowedActions: ["chat"], demoMode: true, csrfToken: "csrf", limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } };
const snapshot = ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: 0, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: "demo", usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] });
function mount(client: Partial<GatewayClient>, draft = "hello", active = false) {
  const store = new ChatStore(client as GatewayClient);
  function Harness() { const [text, setText] = useState(draft); return createElement(Composer, { client: client as GatewayClient, submission: store.submissionFor("c1"), onCancel: runId => store.cancel(runId), snapshot: active ? { ...snapshot, activeRunId: "r1", runStatus: "waiting_approval" } : snapshot, session, draft: text, onDraft: setText, onRefresh: async () => {} }); }
  return render(createElement(Harness));
}
const applied = async (_id: string, input: { commandId: string }) => ({ commandId: input.commandId, status: "applied" as const, revision: 1 });
afterEach(cleanup);

it("sends only the reviewed transport with no client-built authorization or goal intent", async () => {
  const sendMessage = vi.fn(applied);
  mount({ sendMessage });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  const input = sendMessage.mock.calls[0]![1] as Record<string, unknown>;
  expect(Object.keys(input).sort()).toEqual(["attachmentIds", "clientMessageId", "commandId", "expectedConversationRevision", "requestedSkillIds", "text"]);
  expect(SendMessageInputSchema.parse(input)).toEqual(input);
  for (const forged of ["authorization", "csrfToken", "policy", "approvalId", "effectId", "credential", "goalIntent", "goalId", "criteria"]) {
    expect(SendMessageInputSchema.safeParse({ ...input, [forged]: "client-built" }).success).toBe(false);
  }
});

it("exposes no structured goal control while goal capability support stays unreviewed", () => {
  mount({});
  for (const pattern of [/goal/i, /objective/i, /criterion/i, /authorization/i]) {
    expect(screen.queryByRole("button", { name: pattern })).toBeNull();
    expect(screen.queryByRole("link", { name: pattern })).toBeNull();
    expect(screen.queryByRole("combobox", { name: pattern })).toBeNull();
    expect(screen.queryByRole("textbox", { name: pattern })).toBeNull();
  }
  expect(screen.getByRole("textbox", { name: "Message" })).toBeTruthy();
  expect(screen.getByLabelText("Attach files")).toBeTruthy();
});

it("reuses the identical command identity when retrying an unavailable response", async () => {
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockImplementation(applied);
  mount({ sendMessage });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText("Response unavailable. Retry the prior message with the same command identity.");
  fireEvent.click(screen.getByRole("button", { name: "Retry prior message" }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(sendMessage.mock.calls[0]![1]).toEqual(sendMessage.mock.calls[1]![1]);
  expect((sendMessage.mock.calls[1]![1] as { commandId: string }).commandId).toBe((sendMessage.mock.calls[0]![1] as { commandId: string }).commandId);
});

it("still holds IME composition and quarantined uploads before any submission", async () => {
  const sendMessage = vi.fn(applied);
  mount({ sendMessage, beginUpload: async () => ({ uploadId: "up1", status: "uploading" }), uploadContent: () => new Promise<void>(() => {}), completeUpload: async () => ({ uploadId: "up1", status: "ready", attachmentId: "a1" }) });
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter", isComposing: true });
  expect(sendMessage).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Attach files"), { target: { files: [new File(["demo"], "demo.txt", { type: "text/plain" })] } });
  await screen.findByText("demo.txt · uploading");
  expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  expect(sendMessage).not.toHaveBeenCalled();
});

it("still cancels through the store-owned run identity without sending a message", async () => {
  const sendMessage = vi.fn(applied);
  const cancelRun = vi.fn(async (_runId: string, commandId: string) => ({ commandId, status: "applied" as const, revision: 2 }));
  mount({ sendMessage, cancelRun }, "hello", true);
  fireEvent.click(screen.getByRole("button", { name: "Stop" }));
  await screen.findByText("Cancellation requested; awaiting the run event.");
  expect(cancelRun).toHaveBeenCalledWith("r1", expect.any(String));
  expect(sendMessage).not.toHaveBeenCalled();
});
