// Adapter tests for the OpenClaw-derived ASI HTTP client.
//
// These tests run against an ephemeral ASI HTTP server and assert the exact
// route, body and header contract of the typed transport. They prove adapter
// behaviour with synthetic test sessions only; a passing transport test is
// never evidence that a live provider, durable transcript or executable tool
// has been qualified.

// @vitest-environment node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAsiClient, TransportFailure, type AsiClient } from "../../apps/openclaw/src/api/client.ts";

const WORKSPACE = "ws-openclaw-transport";
const CSRF = "csrf-transport-fixture";
const SESSION_COOKIE = "asi-session=transport-fixture";

interface RecordedRequest {
  method: string;
  path: string;
  body?: unknown;
  csrf?: string | null;
}

const recorded: RecordedRequest[] = [];

function capabilitiesFixture(liveOperations: string[], revision = 1) {
  const all = [
    "conversation.read", "conversation.create", "conversation.update", "message.send", "run.cancel",
    "clarification.answer", "approval.decide", "upload.create", "artifact.read", "provider.read",
    "provider.write", "model.read", "model.write", "skill.read", "skill.write", "connection.read",
    "connection.write", "memory.read", "memory.write", "activity.read", "usage.read", "settings.read", "settings.write",
  ];
  return {
    schemaVersion: 1,
    revision,
    operations: all.map(operation => ({
      operation,
      state: liveOperations.includes(operation) ? "live" : "synthetic",
    })),
  };
}

const sessionFixture = {
  workspaceId: WORKSPACE,
  displayName: "Transport workspace",
  subjectId: "subject-transport",
  allowedActions: ["conversation.read", "conversation.create", "conversation.update", "message.send", "run.cancel", "clarification.answer", "approval.decide", "upload.create", "model.read", "settings.read", "memory.read", "activity.read", "provider.read", "skill.read", "connection.read"],
  demoMode: false,
  csrfToken: CSRF,
  limits: { maxMessageBytes: 1048576, maxAttachmentBytes: 16777216, maxAttachmentCount: 16 },
  supportedEvents: ["message.created", "message.completed", "run.status"],
};

function conversationFixture(id: string) {
  return {
    conversationId: id,
    workspaceId: WORKSPACE,
    title: "Transport conversation",
    lastUpdatedAt: "2026-10-21T09:00:00.000Z",
    pendingDecisionCount: 0,
    activeRun: null,
    revision: 3,
  };
}

function snapshotFixture(conversationId: string) {
  return {
    conversationId,
    workspaceId: WORKSPACE,
    revision: 3,
    lastEventSequence: 0,
    messages: [],
    interactions: [],
    tasks: [],
    tools: [],
    artifacts: [],
    runStatus: null,
    effectiveModel: null,
    usage: { inputTokens: 0, outputTokens: 0, costMicroUsd: 0 },
    composerCapabilities: ["message.send"],
  };
}

let liveOperations: string[] = [];
const serverRevision = 1;
let failNextMutations = 0;
let base = "";
let server: Server;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function authenticated(req: IncomingMessage): boolean {
  return (req.headers.cookie ?? "").includes("asi-session=transport-fixture");
}

function csrfHeader(req: IncomingMessage): string | null {
  const value = req.headers["x-csrf-token"];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (path === "/health") return sendJson(res, 200, { status: "ok", service: "asi-ui-gateway" });

  if (!path.startsWith("/api/ui/v1/")) return sendJson(res, 404, { error: "not found" });
  if (!authenticated(req)) return sendJson(res, 401, { error: "unauthenticated" });

  const csrf = csrfHeader(req);
  const route = path.slice("/api/ui/v1".length);

  if (method === "GET" && route === "/me") return sendJson(res, 200, sessionFixture);
  if (method === "GET" && route === "/capabilities") return sendJson(res, 200, capabilitiesFixture(liveOperations, serverRevision));

  if (method === "GET" && route === "/conversations") {
    recorded.push({ method: "GET", path: "/conversations", csrf });
    return sendJson(res, 200, { items: [conversationFixture("conv-a")], nextCursor: null });
  }
  if (method === "POST" && route === "/conversations") {
    const body = await readBody(req);
    recorded.push({ method: "POST", path: "/conversations", body, csrf });
    if (csrf !== CSRF) return sendJson(res, 403, { error: "csrf" });
    return sendJson(res, 201, conversationFixture("conv-new"));
  }

  const snapshot = /^\/conversations\/([^/]+)\/snapshot$/.exec(route);
  if (method === "GET" && snapshot) {
    recorded.push({ method: "GET", path: "/conversations/:id/snapshot", csrf });
    return sendJson(res, 200, snapshotFixture(decodeURIComponent(snapshot[1] ?? "")));
  }

  const messages = /^\/conversations\/([^/]+)\/messages$/.exec(route);
  if (method === "POST" && messages) {
    const body = await readBody(req) as { commandId: string };
    recorded.push({ method: "POST", path: "/conversations/:id/messages", body, csrf });
    if (failNextMutations > 0) {
      failNextMutations -= 1;
      return sendJson(res, 502, { error: "ambiguous outcome" });
    }
    return sendJson(res, 200, { commandId: body.commandId, revision: 4, status: "applied" });
  }

  const cancel = /^\/runs\/([^/]+)\/cancel$/.exec(route);
  if (method === "POST" && cancel) {
    const body = await readBody(req) as { commandId: string };
    recorded.push({ method: "POST", path: "/runs/:id/cancel", body, csrf });
    return sendJson(res, 200, { commandId: body.commandId, revision: 5, status: "applied" });
  }

  if (method === "GET" && route === "/models") {
    recorded.push({ method: "GET", path: "/models" });
    return sendJson(res, 200, { items: [], revision: 0, availability: "unavailable", reason: "Model catalog is not available in this build." });
  }
  if (method === "GET" && route === "/settings") {
    recorded.push({ method: "GET", path: "/settings" });
    return sendJson(res, 200, { revision: 1, allowedActions: ["settings.read"], availability: "unavailable", privacyMode: "unavailable", spendLimitMicroUsd: null, retentionDays: null, notifications: false, scheduleEnabled: false });
  }
  if (method === "GET" && route === "/memory") {
    recorded.push({ method: "GET", path: "/memory" });
    return sendJson(res, 200, { items: [], nextCursor: null });
  }
  if (method === "GET" && route === "/activity") {
    recorded.push({ method: "GET", path: "/activity" });
    return sendJson(res, 200, { items: [], nextCursor: null });
  }

  return sendJson(res, 404, { error: "not found" });
}

function clientFor(): AsiClient {
  // The adapter itself only ever issues relative same-origin paths. This
  // wrapper reproduces the browser's role: resolving those paths against the
  // test origin and attaching the session cookie. It is test setup, not
  // frontend authentication code.
  const originFetch: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? base + input : input;
    const headers = new Headers(init.headers ?? {});
    headers.set("cookie", SESSION_COOKIE);
    return fetch(url, { ...init, headers });
  };
  return createAsiClient({ fetch: originFetch });
}

describe("openclaw ASI transport", () => {
  beforeAll(async () => {
    server = createServer((req, res) => {
      handle(req, res).catch(() => sendJson(res, 500, { error: "handler failure" }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    base = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  });

  it("health validates liveness without interpreting it as capability support", async () => {
    const client = clientFor();
    const health = await client.health();
    expect(health.status).toBe("ok");
    expect(recorded.some(r => r.path.startsWith("/conversations") || r.path === "/models")).toBe(false);
  });

  it("session reads /me and retains CSRF in connection memory", async () => {
    liveOperations = ["conversation.create"];
    const client = clientFor();
    const session = await client.session();
    expect(session.workspaceId).toBe(WORKSPACE);
    // Mutations must then carry the CSRF token; nothing is persisted to storage.
    const created = await client.createConversation({ commandId: "cmd-create-1" });
    expect(created.conversationId).toBe("conv-new");
    const post = recorded.find(r => r.method === "POST" && r.path === "/conversations");
    expect(post?.csrf).toBe(CSRF);
  });

  it("capabilities parses the discovery schema and rejects unknown versions", async () => {
    const client = clientFor();
    liveOperations = ["conversation.read"];
    const caps = await client.capabilities();
    expect(caps.revision).toBe(serverRevision);
    expect(caps.operations.find(o => o.operation === "conversation.read")?.state).toBe("live");
  });

  it("401 discovery returns a typed transport failure", async () => {
    const unauthenticatedFetch: typeof fetch = (input, init) => fetch(typeof input === "string" ? base + input : input, init);
    const client = createAsiClient({ fetch: unauthenticatedFetch });
    await expect(client.capabilities()).rejects.toBeInstanceOf(TransportFailure);
    await expect(client.capabilities()).rejects.toMatchObject({ status: 401 });
  });

  it("maps exact routes, bodies and CSRF headers for domain operations", async () => {
    recorded.length = 0;
    liveOperations = ["conversation.read", "conversation.create", "message.send", "run.cancel", "model.read", "settings.read", "memory.read", "activity.read"];
    const client = clientFor();
    await client.session();

    await client.listConversations();
    await client.getSnapshot("conv-a");
    await client.sendMessage("conv-a", { commandId: "cmd-msg-1", clientMessageId: "cm-1", text: "hello", attachmentIds: [], requestedSkillIds: [], expectedConversationRevision: 3 });
    await client.cancelRun("run-1", "cmd-cancel-1");
    await client.getModels();
    await client.getSettings();
    await client.queryMemory({ query: "remember", limit: 10 });
    await client.getActivity({ limit: 10 });

    const paths = recorded.map(r => `${r.method} ${r.path}`);
    expect(paths).toEqual([
      "GET /conversations",
      "GET /conversations/:id/snapshot",
      "POST /conversations/:id/messages",
      "POST /runs/:id/cancel",
      "GET /models",
      "GET /settings",
      "GET /memory",
      "GET /activity",
    ]);
    const message = recorded.find(r => r.path === "/conversations/:id/messages");
    expect(message?.body).toMatchObject({ commandId: "cmd-msg-1", clientMessageId: "cm-1", text: "hello", attachmentIds: [], expectedConversationRevision: 3 });
    expect(message?.csrf).toBe(CSRF);
    const cancel = recorded.find(r => r.path === "/runs/:id/cancel");
    expect(cancel?.body).toEqual({ commandId: "cmd-cancel-1" });
  });

  it("denied operations generate zero product requests", async () => {
    recorded.length = 0;
    // Nothing is live: every mutation and product read must fail closed.
    liveOperations = [];
    const client = clientFor();
    await client.session();

    await expect(client.sendMessage("conv-a", { commandId: "cmd-denied-1", clientMessageId: "cm-2", text: "blocked", attachmentIds: [], requestedSkillIds: [], expectedConversationRevision: 3 })).rejects.toThrow(/not (live|supported|available)/i);
    await expect(client.cancelRun("run-1", "cmd-denied-2")).rejects.toThrow(/not (live|supported|available)/i);
    await expect(client.getModels()).rejects.toThrow(/not (live|supported|available)/i);

    const productRequests = recorded.filter(r => r.path !== "/conversations");
    expect(productRequests).toEqual([]);
  });

  it("uncertain retry preserves commandId", async () => {
    recorded.length = 0;
    liveOperations = ["conversation.read", "message.send"];
    failNextMutations = 1;
    const client = clientFor();
    await client.session();

    const input = { commandId: "cmd-uncertain-9", clientMessageId: "cm-9", text: "uncertain", attachmentIds: [], requestedSkillIds: [], expectedConversationRevision: 3 };
    await expect(client.sendMessage("conv-a", input)).rejects.toBeInstanceOf(TransportFailure);
    // The caller retries with its own input; the client must not mint a new id.
    expect(input.commandId).toBe("cmd-uncertain-9");
    const retry = await client.sendMessage("conv-a", input);
    expect(retry.status).toBe("applied");
    const bodies = recorded.filter(r => r.path === "/conversations/:id/messages").map(r => (r.body as { commandId: string }).commandId);
    expect(bodies).toEqual(["cmd-uncertain-9", "cmd-uncertain-9"]);
    failNextMutations = 0;
  });

  it("malformed discovery clears actionable support for callers", async () => {
    const broken = createServer((req, res) => {
      const path = new URL(req.url ?? "/", "http://127.0.0.1").pathname;
      if (path === "/health") return sendJson(res, 200, { status: "ok" });
      if (path === "/api/ui/v1/capabilities") return sendJson(res, 200, { schemaVersion: 99, revision: -1 });
      sendJson(res, 404, { error: "not found" });
    });
    await new Promise<void>(resolve => broken.listen(0, "127.0.0.1", resolve));
    const address = broken.address();
    if (!address || typeof address === "string") throw new Error("missing port");
    const brokenBase = `http://127.0.0.1:${address.port}`;
    try {
      const client = createAsiClient({ fetch: ((input, init) => fetch(typeof input === "string" ? brokenBase + input : input, init)) as typeof fetch });
      await expect(client.capabilities()).rejects.toBeInstanceOf(TransportFailure);
    } finally {
      await new Promise<void>((resolve, reject) => broken.close(error => (error ? reject(error) : resolve())));
    }
  });
});
