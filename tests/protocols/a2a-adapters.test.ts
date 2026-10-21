import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { A2A_REVISION } from "../../backend/modules/protocols/src/a2a/versions.js";
import { sanitizeAgentCard, validateAgentCard } from "../../backend/modules/protocols/src/a2a/card.js";
import {
  createA2aClient, digest, type A2AClientServices,
} from "../../backend/modules/protocols/src/a2a/client.js";
import { createA2aServer, type A2AServerServices } from "../../backend/modules/protocols/src/a2a/server.js";
import type { Principal, RunContext, TaskEnvelope, TaskResult } from "@asi/contracts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

const principal = (): Principal => ({
  tenantId: "tenant-a", subjectId: "user-a", roles: ["user"], capabilities: ["task:execute"],
  audience: "a2a-client", authenticatedSource: "fixture", expiresAt: new Date(Date.now() + 60000).toISOString(),
});
const context = (tenantId = "tenant-a"): RunContext => ({
  runId: "run-a", sessionId: "session-a", writerEpoch: 1, mode: "execute",
  deadlineAt: new Date(Date.now() + 60000).toISOString(),
  budgetRef: { tenantId, accountId: "budget-a", rootRunId: "run-a" },
});
const task = (overrides: Partial<TaskEnvelope> = {}): TaskEnvelope => ({
  schemaVersion: 1, taskId: "task-a", traceId: "trace-a", correlationId: "corr-a", causationId: "cause-a",
  runContext: context(), requiredCapabilities: ["task:execute"], input: { prompt: "hi" },
  principalGrant: principal(), idempotencyKey: "idem-a", ...overrides,
});

function fixtureCard(endpoint: string, metadata: Record<string, unknown>) {
  return { schemaVersion: 1, name: "Fixture Agent", description: "fixture", url: endpoint, version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text"], defaultOutputModes: ["text"],
    skills: [{ id: "echo", name: "Echo", description: "echo" }], metadata };
}
function expectedCardDigest(endpoint: string): string {
  return digest(sanitizeAgentCard(validateAgentCard(fixtureCard(endpoint, {}))));
}

/** In-memory governance FIXTURE. Not a substitute for PostgreSQL/policy/isolation/signing qualification. */
function clientFixture(endpoint: string) {
  const events: string[] = [];
  const abort = new AbortController();
  const completed = new Map<string, TaskResult>();
  let approved = true, deny = false, stale = false, receiptValid = true, wrongDigest = false;
  const services: A2AClientServices = {
    async verifyPrincipal(p) { events.push("identity"); if (p.subjectId !== "user-a") throw new Error("fixture grant revoked"); },
    async credential() { return { token: "resource-token", audience: "remote-agent", resource: endpoint,
      expiresAt: new Date(Date.now() + 60000).toISOString() }; },
    async approvedRemoteAgents() { return approved ? [{ agentId: "agent-1", cardUrl: endpoint,
      cardDigest: wrongDigest ? "f".repeat(64) : expectedCardDigest(endpoint), requiredCapabilities: ["task:execute"] }] : []; },
    runSignal() { return abort.signal; },
    async assertRun(p, c) { if (stale || p.tenantId !== c.budgetRef.tenantId) throw new Error("fixture stale writer"); },
    async executeRemoteTask(effect, _p, dispatch) {
      events.push("intent");
      if (deny) { events.push("deny"); throw new Error("fixture policy denied"); }
      if (completed.has(effect.effectId)) return completed.get(effect.effectId)!;
      events.push("policy", "budget", "start");
      const result = await dispatch();
      events.push("receipt", "complete");
      completed.set(effect.effectId, result);
      return result;
    },
    async verifyReceipt() { if (!receiptValid) throw new Error("fixture invalid receipt"); },
  };
  return { services, events, abort, deny: () => { deny = true; }, stale: () => { stale = true; },
    unapprove: () => { approved = false; }, wrongDigest: () => { wrongDigest = true; }, badReceipt: () => { receiptValid = false; } };
}

function clientConfig(endpoint: string, state = clientFixture(endpoint), overrides: Record<string, unknown> = {}) {
  const api = createA2aClient({ audience: "a2a-client", cardUrl: endpoint, services: state.services,
    network: { mode: "fixture", endpoints: [{ endpoint, resource: endpoint, audience: "remote-agent" }] }, ...overrides });
  cleanup.push(() => api.close());
  return { api, state };
}

async function serveA2a(options: { protocolVersion?: string; redirect?: boolean; huge?: boolean } = {}) {
  let calls = 0;
  const server: Server = createServer((req, res) => {
    const endpoint = "http://" + (req.headers.host ?? "127.0.0.1") + "/a2a";
    if (options.redirect) { res.writeHead(307, { location: "http://169.254.169.254/" }); res.end(); return; }
    if (options.huge) { res.writeHead(200, { "content-type": "application/json" }); res.end("x".repeat(150000)); return; }
    if (req.method === "GET" && req.url === "/a2a") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(fixtureCard(endpoint, { protocolVersion: options.protocolVersion ?? A2A_REVISION,
        audience: "remote-agent", secret: "do-not-leak" }))); return;
    }
    if (req.method === "POST" && req.url === "/a2a/tasks") {
      calls++; res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: "task-a", result: { id: "remote-1", status: "working" } })); return;
    }
    if (req.method === "GET" && req.url === "/a2a/tasks/remote-1") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", id: "task-a", result: { id: "remote-1", status: "completed", artifacts: [{ value: "ok" }] } })); return;
    }
    res.writeHead(404); res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture port unavailable");
  const endpoint = "http://127.0.0.1:" + address.port + "/a2a";
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { endpoint, calls: () => calls };
}

describe("A2A client (fixture governance)", () => {
  it("discovers, sanitizes and pins the allowlisted agent card", async () => {
    const server = await serveA2a(); const { api, state } = clientConfig(server.endpoint);
    const card = await api.getAgentCard(principal());
    expect(card.name).toBe("Fixture Agent");
    expect(card.metadata).toBeUndefined();
    expect(card.url).toBe(server.endpoint);
    expect(state.events).toContain("identity");
  });

  it("submits a bounded remote task and maps the terminal status", async () => {
    const server = await serveA2a(); const { api } = clientConfig(server.endpoint);
    const result = await api.submitRemoteTask(server.endpoint, task(), principal());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.output).toEqual({ value: "ok" });
    expect(server.calls()).toBe(1);
  });

  it("deduplicates through the governed intent owner", async () => {
    const server = await serveA2a(); const { api } = clientConfig(server.endpoint);
    await api.submitRemoteTask(server.endpoint, task(), principal());
    await api.submitRemoteTask(server.endpoint, task(), principal());
    expect(server.calls()).toBe(1);
  });

  it("rejects a mismatched A2A revision", async () => {
    const server = await serveA2a({ protocolVersion: "2.0.0" }); const { api } = clientConfig(server.endpoint);
    await expect(api.getAgentCard(principal())).rejects.toThrow("A2A_PROTOCOL_VERSION");
  });

  it("rejects redirects and oversized exchanges", async () => {
    const redirect = await serveA2a({ redirect: true });
    await expect(clientConfig(redirect.endpoint).api.getAgentCard(principal())).rejects.toThrow();
    const huge = await serveA2a({ huge: true });
    await expect(clientConfig(huge.endpoint).api.getAgentCard(principal())).rejects.toThrow();
  });

  it("rejects an unapproved or changed remote agent", async () => {
    const server = await serveA2a();
    const unapproved = clientConfig(server.endpoint); unapproved.state.unapprove();
    await expect(unapproved.api.getAgentCard(principal())).rejects.toThrow("A2A_APPROVAL");
    const changed = clientConfig(server.endpoint); changed.state.wrongDigest();
    await expect(changed.api.getAgentCard(principal())).rejects.toThrow("A2A_APPROVAL");
  });

  it("rejects tenant mismatch and delegated capability escalation", async () => {
    const server = await serveA2a(); const { api } = clientConfig(server.endpoint);
    const crossTenant = task({ runContext: context("tenant-b"),
      principalGrant: { ...principal(), tenantId: "tenant-b" } });
    await expect(api.submitRemoteTask(server.endpoint, crossTenant, principal())).rejects.toThrow("A2A_AUTH");
    const escalated = task({ requiredCapabilities: ["task:admin"] });
    await expect(api.submitRemoteTask(server.endpoint, escalated, principal())).rejects.toThrow("A2A_AUTH");
    expect(server.calls()).toBe(0);
  });

  it.each(["deny", "stale", "badReceipt"] as const)("blocks %s before publication", async action => {
    const server = await serveA2a(); const { api, state } = clientConfig(server.endpoint);
    state[action]();
    await expect(api.submitRemoteTask(server.endpoint, task(), principal())).rejects.toThrow();
  });

  it("requires every enforcement port with no permissive defaults", () => {
    expect(() => createA2aClient({ audience: "a2a-client", cardUrl: "https://x/a2a",
      network: { mode: "fixture", endpoints: [] }, services: {} as unknown as A2AClientServices })).toThrow();
  });
});

/** In-memory inbound FIXTURE. Not a substitute for PostgreSQL/policy/isolation qualification. */
function inboundFixture(resourceHref: string) {
  const runContext = context();
  let result: TaskResult = { schemaVersion: 1, taskId: "task-a", runId: "run-a", traceId: "trace-a",
    status: "completed", output: { answer: 42 }, usage: { inputTokens: 0, outputTokens: 0 }, evidenceRefs: [] };
  let cancelled = false;
  const services: A2AServerServices = {
    async verifyToken() { return { principal: { ...principal(), audience: "a2a-inbound" }, audience: "a2a-inbound", resource: resourceHref,
      expiresAt: new Date(Date.now() + 60000).toISOString() }; },
    async verifyPrincipal() {},
    async resolveRun() { return runContext; },
    async assertRun() {},
    runSignal() { return new AbortController().signal; },
    async executeApprovedTask() { return result; },
    async verifyReceipt() {},
    cancelRun() { cancelled = true; },
  };
  return { services, isCancelled: () => cancelled, setResult: (value: TaskResult) => { result = value; } };
}

describe("A2A server inbound", () => {
  const resource = "https://agent.example/a2a";
  const host = "agent.example";
  function post(body: string, headers: Record<string, string> = {}) {
    return new Request(resource + "/tasks", { method: "POST",
      headers: { host, "content-type": "application/json", "a2a-protocol-version": A2A_REVISION,
        authorization: "Bearer inbound-token", ...headers }, body });
  }
  function build(fixture: ReturnType<typeof inboundFixture>) {
    return createA2aServer({ resource, audience: "a2a-inbound", mode: "live",
      allowedOrigins: ["https://app.example"], authorizationServers: ["https://auth.example"], services: fixture.services });
  }

  it("rejects a missing revision and a missing bearer before any effect", async () => {
    const server = build(inboundFixture(resource));
    expect((await server.fetch(post("{}", { "a2a-protocol-version": "" }))).status).toBe(400);
    expect((await server.fetch(post("{}", { authorization: "" }))).status).toBe(401);
  });

  it("executes an approved inbound task and reports the mapped status", async () => {
    const server = build(inboundFixture(resource));
    const envelope = JSON.stringify({ jsonrpc: "2.0", id: "task-a", method: "tasks/send", params: { task: task() } });
    const response = await server.fetch(post(envelope));
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { status: string; artifacts: unknown[] } };
    expect(body.result.status).toBe("completed");
    expect(body.result.artifacts).toEqual([{ answer: 42 }]);
  });

  it("exposes the protected-resource metadata document", async () => {
    const server = build(inboundFixture(resource));
    const response = await server.fetch(new Request("https://agent.example/.well-known/oauth-protected-resource/a2a",
      { method: "GET", headers: { host } }));
    expect(response.status).toBe(200);
    const body = await response.json() as { resource: string };
    expect(body.resource).toBe(resource);
  });

  it("cancels a durable inbound task by id", async () => {
    const fixture = inboundFixture(resource);
    const server = build(fixture);
    const envelope = JSON.stringify({ jsonrpc: "2.0", id: "task-a", method: "tasks/send", params: { task: task() } });
    await server.fetch(post(envelope));
    const cancel = await server.fetch(new Request(resource + "/tasks/task-a/cancel",
      { method: "POST", headers: { host, "a2a-protocol-version": A2A_REVISION, authorization: "Bearer inbound-token" } }));
    expect(cancel.status).toBe(200);
    expect(fixture.isCancelled()).toBe(true);
  });
});
