import { afterEach, expect, it, vi } from "vitest";
import { ChatStore } from "../../../apps/web/src/lib/chat/store.js";
import { GatewayError, HttpGatewayClient } from "../../../apps/web/src/lib/gateway/http-client.js";
import { ConversationSnapshotSchema } from "../../../packages/contracts/src/ui/index.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";

const snapshot = (sequence = 0) => ConversationSnapshotSchema.parse({ conversationId: "c1", workspaceId: "w1", revision: sequence, lastEventSequence: sequence, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: [] });
const session = { workspaceId: "w1", displayName: "Demo", subjectId: "u1", allowedActions: [], demoMode: true, csrfToken: "csrf", limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } };
const event = { schemaVersion: 1, eventId: "e1", conversationId: "c1", sequence: 1, occurredAt: "2026-10-06T12:00:00Z", eventType: "notice", payload: { summary: "Ready" } };
afterEach(() => vi.unstubAllGlobals());
it("parses fragmented CRLF SSE frames without dropping a validated event", async () => {
  const bytes = new TextEncoder().encode(`: keepalive\r\ndata: ${JSON.stringify(event)}\r\n\r\n`);
  vi.stubGlobal("fetch", async () => new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }), { headers: { "content-type": "text/event-stream", "x-asi-demo": "true" } }));
  const received = [];
  for await (const item of new HttpGatewayClient("demo").subscribe("c1", 0, new AbortController().signal)) received.push(item);
  expect(received).toEqual([event]);
});
it("rejects a truncated SSE frame rather than accepting an incomplete reconnect", async () => {
  vi.stubGlobal("fetch", async () => new Response(`data: ${JSON.stringify(event)}`, { headers: { "content-type": "text/event-stream" } }));
  const collect = async () => { for await (const _event of new HttpGatewayClient("demo").subscribe("c1", 0, new AbortController().signal)) void _event; };
  await expect(collect()).rejects.toThrow("incomplete");
});
it("resnapshots an expired replay cursor and stops retrying expired authentication", async () => {
  const getSnapshot = vi.fn().mockResolvedValueOnce(snapshot()).mockResolvedValue(snapshot(4));
  let attempts = 0;
  const subscribe = async function* () { attempts++; if (attempts === 1) throw new GatewayError(409, "expired cursor"); throw new GatewayError(401, "expired session"); yield event; };
  const store = new ChatStore({ getMe: async () => session, getSnapshot, subscribe } as unknown as GatewayClient);
  await store.open("c1");
  await vi.waitFor(() => expect(store.getSnapshot().connection).toBe("unauthenticated"));
  expect(getSnapshot).toHaveBeenCalledTimes(2);
  expect(attempts).toBe(2);
  expect(store.getSnapshot().conversation).toBeNull();
  store.clear();
});
it("clears sensitive state and prevents a late snapshot from restoring it", async () => {
  let resolveSnapshot!: (value: ReturnType<typeof snapshot>) => void;
  const getSnapshot = () => new Promise<ReturnType<typeof snapshot>>(resolve => { resolveSnapshot = resolve; });
  const store = new ChatStore({ getMe: async () => session, getSnapshot } as unknown as GatewayClient);
  const opening = store.open("c1");
  await vi.waitFor(() => expect(resolveSnapshot).toBeDefined());
  store.setDraft("private draft"); store.clear(); resolveSnapshot(snapshot()); await opening;
  expect(store.getSnapshot()).toMatchObject({ workspaceId: null, conversation: null, draft: "", connection: "idle" });
});

it("does not let an old recovery rejection clear a newly opened conversation", async () => {
  let rejectOld!: (error: Error) => void;
  let calls = 0;
  const getSnapshot = async (id: string) => {
    if (id === "c2") return { ...snapshot(), conversationId: "c2" };
    if (++calls === 1) return snapshot();
    return await new Promise<ReturnType<typeof snapshot>>((_, reject) => { rejectOld = reject; });
  };
  const subscribe = async function* (id: string) { if (id === "c1") throw new GatewayError(409, "expired cursor"); return; yield event; };
  const store = new ChatStore({ getMe: async () => session, getSnapshot, subscribe } as unknown as GatewayClient);
  await store.open("c1"); await vi.waitFor(() => expect(rejectOld).toBeDefined());
  await store.open("c2"); rejectOld(new GatewayError(401, "old expired session"));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(store.getSnapshot()).toMatchObject({ connection: "connected", conversation: { snapshot: { conversationId: "c2" } } });
  store.clear();
});
it("bounds both expired-cursor retries and gap recovery without snapshot progress", async () => {
  for (const mode of ["expired", "gap"] as const) {
    let attempts = 0;
    const subscribe = async function* () { attempts++; if (mode === "expired") throw new GatewayError(409, "expired cursor"); yield { ...event, sequence: 2 }; };
    const store = new ChatStore({ getMe: async () => session, getSnapshot: async () => snapshot(), subscribe } as unknown as GatewayClient);
    await store.open("c1");
    await vi.waitFor(() => expect(store.getSnapshot().connection).toBe("disconnected"), { timeout: 2500 });
    expect(attempts).toBe(3); store.clear();
  }
});
