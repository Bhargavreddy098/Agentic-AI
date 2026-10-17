// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatStore } from "../../../apps/web/src/lib/chat/store.js";
import { HttpGatewayClient } from "../../../apps/web/src/lib/gateway/http-client.js";
import { renderMarkdown, sanitizeHtml } from "../../../apps/web/src/features/chat/markdown.js";
import SafeMarkdown, { safeHttpUrl } from "../../../apps/web/src/features/chat/SafeMarkdown.js";
import { MemoryPanel } from "../../../apps/web/src/features/memory/MemoryPanel.js";
import { ConversationSnapshotSchema, MemoryViewSchema, UiEventSchema, WorkspaceSessionSchema } from "../../../packages/contracts/src/ui/index.js";

const SECRET = "sk-live-secret-0001";
const PRIVATE_VALUE = "private-note-42-should-not-persist";
const session = (workspaceId = "w1") => WorkspaceSessionSchema.parse({ workspaceId, displayName: "Demo", subjectId: "u1", allowedActions: [], demoMode: true, csrfToken: "csrf-token", limits: { maxMessageBytes: 1000, maxAttachmentBytes: 1000, maxAttachmentCount: 1 } });
const snapshot = (conversationId = "c1", workspaceId = "w1", sequence = 0) => ConversationSnapshotSchema.parse({ conversationId, workspaceId, revision: sequence, lastEventSequence: sequence, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: [] });
const leakChecks = (secret: string) => {
  expect(window.location.href).not.toContain(secret);
  expect(JSON.stringify(window.localStorage)).not.toContain(secret);
  expect(JSON.stringify(window.sessionStorage)).not.toContain(secret);
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe("browser exposure stays inside its authorization scope", () => {
  it("shows private memory as inert text without persisting or logging it", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    const payload = `<img src=x onerror="alert(1)">${SECRET}`;
    const records = [PRIVATE_VALUE, payload].map((value, index) => MemoryViewSchema.parse({ revision: 1, allowedActions: [], memoryId: `m${index}`, scope: "Private", value, sourceIds: [], confidence: 0.9 }));
    render(<MemoryPanel workspaceId="w1" client={{ queryMemory: async () => ({ items: records, nextCursor: null }) }} />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByTestId("memory-m0");
    expect(document.querySelector("img,[onerror]")).toBeNull();
    expect(document.body.innerHTML).not.toContain("<img");
    expect(document.body.textContent).toContain(payload);
    leakChecks(SECRET);
    leakChecks(PRIVATE_VALUE);
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(SECRET);
  });

  it("rejects events or snapshots that smuggle extra fields into state", async () => {
    const spies = (["log", "info", "debug", "warn", "error"] as const).map(name => vi.spyOn(console, name).mockImplementation(() => {}));
    expect(UiEventSchema.safeParse({ schemaVersion: 1, eventId: "e1", conversationId: "c1", sequence: 1, occurredAt: "2026-10-06T12:00:00Z", eventType: "notice", payload: { summary: "ok", secret: SECRET } }).success).toBe(false);
    expect(ConversationSnapshotSchema.safeParse({ ...snapshot(), secret: SECRET }).success).toBe(false);
    leakChecks(SECRET);
    for (const spy of spies) for (const call of spy.mock.calls) expect(JSON.stringify(call)).not.toContain(SECRET);
  });

  it("clears a private draft when the workspace identity changes", async () => {
    let workspaceId = "w1";
    const store = new ChatStore({
      getMe: async () => session(workspaceId),
      getSnapshot: async (id: string) => snapshot(id, workspaceId),
      subscribe: async function* () {},
    } as never);
    await store.open("c1");
    store.setDraft(PRIVATE_VALUE);
    expect(store.getSnapshot().draft).toBe(PRIVATE_VALUE);
    workspaceId = "w2";
    await store.open("c2");
    expect(store.getSnapshot().draft).toBe("");
    await store.open("c1");
    expect(store.getSnapshot().draft).toBe("");
    store.clear();
  });

  it("denies a conversation whose ownership does not match the session workspace", async () => {
    const store = new ChatStore({
      getMe: async () => session("w1"),
      getSnapshot: async () => snapshot("c1", "w2"),
      subscribe: async function* () {},
    } as never);
    await store.open("c1");
    await waitFor(() => expect(store.getSnapshot().connection).toBe("unauthenticated"));
    expect(store.getSnapshot().conversation).toBeNull();
    expect(store.getSnapshot().workspaceId).toBeNull();
    store.clear();
  });

  it("refuses a live client that targets a loopback fixture and sends CSRF on mutations only", async () => {
    expect(() => new HttpGatewayClient("live", "http://127.0.0.1:4300")).toThrow(/loopback/i);
    const sessionPayload = { ...session("w1"), demoMode: false };
    const calls: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      if (url.endsWith("/me")) return new Response(JSON.stringify(sessionPayload), { status: 200, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ commandId: "cmd-1", status: "applied", revision: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const client = new HttpGatewayClient("live");
    await client.submitCommand({ commandId: "cmd-1", expectedRevision: 0, type: "settings.update", changes: { retentionDays: 7 } });
    expect(calls[0]?.url.endsWith("/me")).toBe(true);
    expect(calls[1]?.url.endsWith("/commands")).toBe(true);
    expect(calls[0]?.headers["x-csrf-token"]).toBeUndefined();
    expect(calls[1]?.headers["x-csrf-token"]).toBe("csrf-token");
  });
});

describe("markdown and preview render safely", () => {
  it("sanitizes script, iframe, event handler and javascript URLs from rendered content", () => {
    expect(renderMarkdown('<script>alert(1)</script><iframe src="https://evil.test"></iframe><img src=x onerror=alert(1)>')).not.toMatch(/<script|<iframe|onerror/i);
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
    const { container } = render(<SafeMarkdown text="[click](javascript:alert(1)) `code`" />);
    expect(container.querySelector("a")).toBeNull();
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://user:pass@example.com")).toBeNull();
  });
});
