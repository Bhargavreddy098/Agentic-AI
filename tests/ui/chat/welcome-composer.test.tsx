// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatStore } from "@asi/web/lib/chat/store.ts";
import WelcomeComposer from "@asi/web/features/chat/WelcomeComposer.tsx";
import type { GatewayClient } from "@asi/web/lib/gateway/client.ts";
import type { SendMessageInput, UiCommandResult } from "@asi/contracts";
const session = { workspaceId: "w1", subjectId: "u1", displayName: "Demo", demoMode: true, csrfToken: "csrf", allowedActions: ["chat"], limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } };
afterEach(cleanup);
const applied = (input: SendMessageInput): UiCommandResult => ({ commandId: input.commandId, status: "applied", revision: 1 });
function mount(client: Partial<GatewayClient>) {
  const navigate = vi.fn();
  const store = new ChatStore(client as GatewayClient);
  const view = render(<WelcomeComposer submissionFor={id => store.submissionFor(id)} client={client as GatewayClient} session={session} onConversationCreated={navigate} />);
  const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "original" } });
  const send = () => fireEvent.click(screen.getByRole("button", { name: /Send|Retry prior message/ }));
  return { ...view, input: input as HTMLTextAreaElement, send, navigate };
}
it("retries uncertain creation with the original command identity", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockResolvedValue({ conversationId: "c1", revision: 0 });
  const view = mount({ createConversation: create, sendMessage: async (_id, input) => applied(input) });
  view.send(); await screen.findByRole("status"); view.send();
  await waitFor(() => expect(view.navigate).toHaveBeenCalledWith("c1", ""));
  expect(create.mock.calls[1]![0]).toBe(create.mock.calls[0]![0]);
});
it("retries uncertain sends in the same conversation with the original payload and keeps newer edits", async () => {
  const create = vi.fn().mockResolvedValue({ conversationId: "c1", revision: 0 });
  const send = vi.fn().mockRejectedValueOnce(new Error("lost response")).mockImplementation(async (_id: string, input: SendMessageInput) => applied(input));
  const view = mount({ createConversation: create, sendMessage: send });
  view.send(); await screen.findByRole("status");
  fireEvent.change(view.input, { target: { value: "newer draft" } }); view.send();
  await waitFor(() => expect(view.navigate).toHaveBeenCalledWith("c1", "newer draft"));
  expect(create).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  expect(view.input.value).toBe("newer draft");
});
it("preserves a rejected draft and displays the Gateway explanation without navigation", async () => {
  const view = mount({ createConversation: async () => ({ conversationId: "c1", revision: 0 }) as never, sendMessage: async (_id, input) => ({ commandId: input.commandId, status: "rejected", revision: 0, error: { safeMessage: "Chat permission denied" } }) as never });
  view.send(); await screen.findByText("Chat permission denied");
  expect(view.input.value).toBe("original"); expect(view.navigate).not.toHaveBeenCalled();
});
it("blocks duplicate submissions and never navigates after unmount", async () => {
  let resolve!: (value: UiCommandResult) => void;
  let sent!: SendMessageInput;
  const send = vi.fn((_id: string, input: SendMessageInput) => { sent = input; return new Promise<UiCommandResult>(done => { resolve = done; }); });
  const view = mount({ createConversation: async () => ({ conversationId: "c1", revision: 0 }) as never, sendMessage: send });
  fireEvent.keyDown(view.input, { key: "Enter" }); fireEvent.keyDown(view.input, { key: "Enter" });
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  view.unmount(); resolve(applied(sent)); await new Promise(done => setTimeout(done, 20));
  expect(view.navigate).not.toHaveBeenCalled();
});
