// @vitest-environment node
import { beforeAll, afterAll, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createUiGateway,
  createMemoryUiPorts,
  createSessionStore,
  type UiUploadLimits,
} from "@asi/gateway-app/ui/index.js";
import { HttpGatewayClient } from "@asi/web/lib/gateway/http-client.js";
import { runGatewayContractTests } from "./harness.js";
import { UiEventSchema, WorkspaceSessionSchema, type UiEvent } from "../../../packages/contracts/src/ui/index.js";

const realFetch = globalThis.fetch;
const jars = new Map<string, Map<string, string>>();
const limits: UiUploadLimits = { maxMessageBytes: 1_048_576, maxAttachmentBytes: 8, maxAttachmentCount: 2 };

let primaryBase = "";
let secondaryBase = "";
let secondaryNow = Date.now();
const servers: ServerType[] = [];

function jarFor(origin: string): Map<string, string> {
  const existing = jars.get(origin);
  if (existing) return existing;
  const created = new Map<string, string>();
  jars.set(origin, created);
  return created;
}

function storeCookies(jar: Map<string, string>, response: Response) {
  const header = response.headers as Headers & { getSetCookie?: () => string[] };
  const list = typeof header.getSetCookie === "function" ? header.getSetCookie() : (response.headers.get("set-cookie") ? [response.headers.get("set-cookie") as string] : []);
  for (const raw of list) {
    const pair = raw.split(";")[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator <= 0) continue;
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    const expired = /max-age=0/i.test(raw) || /expires=thu, 01 jan 1970/i.test(raw);
    if (!value || expired) jar.delete(name);
    else jar.set(name, value);
  }
}

function installInterceptor() {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const resolved = requested.startsWith("/") ? primaryBase + requested : requested;
    const origin = new URL(resolved).origin;
    const jar = jarFor(origin);
    const headers = new Headers(init.headers ?? {});
    if (jar.size) headers.set("cookie", [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; "));
    if (!headers.has("origin")) headers.set("origin", origin);
    const response = await realFetch(resolved, { ...init, headers });
    storeCookies(jar, response);
    return response;
  }) as typeof fetch;
}

async function listen(fetchHandler: (request: Request) => Response | Promise<Response>): Promise<string> {
  const server = serve({ fetch: fetchHandler, hostname: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server missing port");
  return `http://127.0.0.1:${address.port}`;
}

async function signIn(assertion: string, base: string) {
  const response = await fetch(`${base}/api/ui/v1/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion }) });
  expect(response.status).toBe(200);
}

async function client(assertion: string): Promise<HttpGatewayClient> {
  await signIn(assertion, primaryBase);
  const gateway = new HttpGatewayClient("live");
  await gateway.getMe();
  return gateway;
}

beforeAll(async () => {
  installInterceptor();
  primaryBase = await listen(createUiGateway({ ...createMemoryUiPorts(), sessions: createSessionStore(), limits }).fetch);
  secondaryBase = await listen(createUiGateway({
    ...createMemoryUiPorts({ scanAvailable: false }),
    sessions: createSessionStore({ ttlMs: 2_000, now: () => secondaryNow }),
    limits,
    now: () => secondaryNow,
  }).fetch);
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const server of servers) await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

runGatewayContractTests(() => client("assert-workspace-a"));

it("keeps conversation ownership inside the authenticated workspace", async () => {
  const owner = await client("assert-workspace-a");
  const created = await owner.createConversation("ownership-create");
  expect((await owner.getSnapshot(created.conversationId)).conversationId).toBe(created.conversationId);
  const stranger = await client("assert-workspace-b");
  await expect(stranger.getSnapshot(created.conversationId)).rejects.toThrow();
  const page = await stranger.listConversations();
  expect(page.items.some(item => item.conversationId === created.conversationId)).toBe(false);
});

it("rejects a stale expected conversation revision without mutating state", async () => {
  const gateway = await client("assert-workspace-a");
  const created = await gateway.createConversation("revision-create");
  const stale = await gateway.sendMessage(created.conversationId, {
    commandId: "revision-stale",
    clientMessageId: "revision-message",
    text: "hello",
    attachmentIds: [],
    requestedSkillIds: [],
    expectedConversationRevision: 99,
  });
  expect(stale.status).toBe("conflict");
  expect((await gateway.getSnapshot(created.conversationId)).messages).toHaveLength(0);
});

it("requires a session, an allowed origin and a matching CSRF token for mutations", async () => {
  const origin = new URL(primaryBase).origin;
  jarFor(origin).clear();
  const unauthenticated = await realFetch(`${primaryBase}/api/ui/v1/conversations`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ commandId: "unauthenticated" }) });
  expect(unauthenticated.status).toBe(401);

  const gateway = await client("assert-workspace-a");
  const session = await gateway.getMe();
  expect(WorkspaceSessionSchema.safeParse(session).success).toBe(true);
  const cookie = [...jarFor(origin).entries()].map(([name, value]) => `${name}=${value}`).join("; ");

  const badOrigin = await realFetch(`${primaryBase}/api/ui/v1/conversations`, { method: "POST", headers: { "content-type": "application/json", origin: "https://untrusted.invalid", "x-csrf-token": session.csrfToken, cookie }, body: JSON.stringify({ commandId: "bad-origin" }) });
  expect(badOrigin.status).toBe(403);

  const missingCsrf = await realFetch(`${primaryBase}/api/ui/v1/conversations`, { method: "POST", headers: { "content-type": "application/json", origin, cookie }, body: JSON.stringify({ commandId: "missing-csrf" }) });
  expect(missingCsrf.status).toBe(403);
});

it("replays ordered events from a cursor and returns nothing past the tail", async () => {
  const gateway = await client("assert-workspace-a");
  const created = await gateway.createConversation("stream-create");
  await gateway.sendMessage(created.conversationId, {
    commandId: "stream-send",
    clientMessageId: "stream-message",
    text: "hello",
    attachmentIds: [],
    requestedSkillIds: [],
    expectedConversationRevision: 0,
  });
  const events: UiEvent[] = [];
  for await (const event of gateway.subscribe(created.conversationId, 0, new AbortController().signal)) {
    expect(UiEventSchema.safeParse(event).success).toBe(true);
    events.push(event);
  }
  expect(events.length).toBeGreaterThan(1);
  expect(events.map(event => event.sequence)).toEqual([...events.map(event => event.sequence)].sort((left, right) => left - right));
  expect(events.every((event, index) => index === 0 || event.sequence === (events[index - 1]?.sequence ?? 0) + 1)).toBe(true);
  const tail = events.at(-1)?.sequence ?? 0;
  const replayed: UiEvent[] = [];
  for await (const event of gateway.subscribe(created.conversationId, tail, new AbortController().signal)) replayed.push(event);
  expect(replayed).toHaveLength(0);
});

it("quarantines uploads, releases only authorized attachments and enforces limits and ownership", async () => {
  const owner = await client("assert-workspace-a");
  const intent = await owner.beginUpload({ commandId: "upload-1", fileName: "note.txt", mimeType: "text/plain", byteSize: 5 });
  expect(intent.status).toBe("uploading");
  await owner.uploadContent(intent.uploadId, new File(["hello"], "note.txt", { type: "text/plain" }), new AbortController().signal);
  const ready = await owner.completeUpload(intent.uploadId, "upload-complete");
  expect(ready).toMatchObject({ status: "ready", attachmentId: expect.any(String) });

  const oversized = await owner.beginUpload({ commandId: "upload-big", fileName: "big.bin", mimeType: "application/octet-stream", byteSize: limits.maxAttachmentBytes + 1 });
  expect(oversized.status).toBe("rejected");
  const blocked = await owner.beginUpload({ commandId: "upload-script", fileName: "script.js", mimeType: "application/javascript", byteSize: 4 });
  expect(blocked.status).toBe("rejected");

  const stranger = await client("assert-workspace-b");
  await expect(stranger.getUpload(intent.uploadId, new AbortController().signal)).rejects.toThrow();
});

it("fails closed when upload authorization is unavailable and clears sessions on logout", async () => {
  const previous = primaryBase;
  primaryBase = secondaryBase;
  secondaryNow = Date.now();
  try {
    const gateway = await client("assert-workspace-a");
    const intent = await gateway.beginUpload({ commandId: "scan-fail", fileName: "note.txt", mimeType: "text/plain", byteSize: 5 });
    await gateway.uploadContent(intent.uploadId, new File(["hello"], "note.txt", { type: "text/plain" }), new AbortController().signal);
    expect((await gateway.completeUpload(intent.uploadId, "scan-fail-complete")).status).toBe("rejected");

    const logout = await fetch(`${secondaryBase}/api/ui/v1/auth/session`, { method: "DELETE" });
    expect(logout.status).toBe(200);
    await expect(gateway.getMe()).rejects.toThrow();
  } finally {
    primaryBase = previous;
  }
});

it("expires idle browser sessions", async () => {
  const previous = primaryBase;
  primaryBase = secondaryBase;
  secondaryNow = Date.now();
  try {
    const gateway = await client("assert-workspace-a");
    secondaryNow += 5_000;
    await expect(gateway.getMe()).rejects.toThrow();
  } finally {
    primaryBase = previous;
  }
});
