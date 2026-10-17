// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatFrame from "@asi/web/features/chat/ChatFrame.tsx";
import { useWorkspace } from "@asi/web/features/shell/WorkspaceProvider.tsx";
import { ChatStore } from "@asi/web/lib/chat/store.ts";
import { ConversationSnapshotSchema } from "@asi/contracts";
import type { GatewayClient } from "@asi/web/lib/gateway/client.ts";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("../../../apps/web/node_modules/next/navigation.js", () => ({ useParams: () => ({}), useRouter: () => ({ push }) }));
vi.mock("@asi/web/features/shell/WorkspaceProvider.tsx", () => ({ useWorkspace: vi.fn() }));
const session = { workspaceId: "w1", subjectId: "u1", displayName: "Demo", demoMode: true, csrfToken: "csrf", allowedActions: ["chat"], limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } };
afterEach(() => { cleanup(); push.mockReset(); });
it("stores a newer welcome draft in the owning canonical conversation before navigating", async () => {
  const snapshot = ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: 1, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: "demo", usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send"] });
  const sendMessage = vi.fn().mockRejectedValueOnce(new Error("uncertain")).mockImplementation(async (_id, input) => ({ commandId: input.commandId, status: "applied", revision: 1 }));
  const client = { getMe: async () => session, createConversation: async () => ({ conversationId: "c1", revision: 0 }), sendMessage, getSnapshot: async () => snapshot, subscribe: async function* () {} } as unknown as GatewayClient;
  const store = new ChatStore(client);
  vi.mocked(useWorkspace).mockReturnValue({ client, store, session, refresh: async () => {} } as ReturnType<typeof useWorkspace>);
  render(<ChatFrame />);
  const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "original" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" })); await screen.findByRole("status");
  fireEvent.change(input, { target: { value: "newer draft" } });
  fireEvent.click(screen.getByRole("button", { name: "Retry prior message" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/chat/c1"));
  expect(store.getSnapshot().draft).toBe("newer draft");
  expect(store.getSnapshot().conversation?.snapshot.conversationId).toBe("c1");
  expect(sendMessage.mock.calls[1]).toEqual(sendMessage.mock.calls[0]);
  store.disconnect();
});
it("remounts the welcome draft when the workspace subject changes", () => {
  const client = {} as GatewayClient;
  const store = new ChatStore(client);
  const workspace = { client, store, session, refresh: async () => {} } as ReturnType<typeof useWorkspace>;
  vi.mocked(useWorkspace).mockReturnValue(workspace);
  const view = render(<ChatFrame />);
  fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "private subject draft" } });
  vi.mocked(useWorkspace).mockReturnValue({ ...workspace, session: { ...session, subjectId: "u2" } });
  view.rerender(<ChatFrame />);
  expect((screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement).value).toBe("");
});


it("retries only canonical draft handoff after an accepted send and failed first snapshot", async () => {
  const snapshot = ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: 1, lastEventSequence: 0, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: "demo", usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send"] });
  let acknowledge!: () => void;
  const sendMessage = vi.fn((_id: string, input: { commandId: string }) => new Promise(resolve => { acknowledge = () => resolve({ commandId: input.commandId, status: "applied", revision: 1 }); }));
  const getSnapshot = vi.fn().mockRejectedValueOnce(new Error("temporary outage")).mockResolvedValue(snapshot);
  const client = { getMe: async () => session, createConversation: async () => ({ conversationId: "c1", revision: 0 }), sendMessage, getSnapshot, subscribe: async function* () {} } as unknown as GatewayClient;
  const store = new ChatStore(client);
  vi.mocked(useWorkspace).mockReturnValue({ client, store, session, refresh: async () => {} } as ReturnType<typeof useWorkspace>);
  render(<ChatFrame />);
  const input = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(input, { target: { value: "original" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "newer draft" } }); acknowledge();
  await screen.findByText("Message accepted. Retry opening the conversation to keep your newer draft.");
  expect(push).not.toHaveBeenCalled();
  expect((input as HTMLTextAreaElement).value).toBe("newer draft");
  fireEvent.click(screen.getByRole("button", { name: "Retry opening conversation" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/chat/c1"));
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(store.getSnapshot().draft).toBe("newer draft");
  store.disconnect();
});
