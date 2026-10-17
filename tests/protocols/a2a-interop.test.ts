import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { A2A_REVISION } from "../../packages/protocols/src/a2a/versions.js";
import {
  sanitizeAgentCard, validateAgentCard, type A2AAgentCard,
} from "../../packages/protocols/src/a2a/card.js";
import {
  createA2aClient, digest, type A2AClientServices,
} from "../../packages/protocols/src/a2a/client.js";
import { createA2aServer, type A2AServerServices } from "../../packages/protocols/src/a2a/server.js";
import type { Principal, RunContext, TaskEnvelope, TaskResult } from "@asi/contracts";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });

const principal = (): Principal => ({
  tenantId: "tenant-a", subjectId: "user-a", roles: ["user"], capabilities: ["task:execute"],
  audience: "a2a-client", authenticatedSource: "fixture", expiresAt: new Date(Date.now() + 60000).toISOString(),
});
const context = (): RunContext => ({
  runId: "run-a", sessionId: "session-a", writerEpoch: 1, mode: "execute",
  deadlineAt: new Date(Date.now() + 60000).toISOString(),
  budgetRef: { tenantId: "tenant-a", accountId: "budget-a", rootRunId: "run-a" },
});
const task = (): TaskEnvelope => ({
  schemaVersion: 1, taskId: "task-a", traceId: "trace-a", correlationId: "corr-a", causationId: "cause-a",
  runContext: context(), requiredCapabilities: ["task:execute"], input: { prompt: "hi" },
  principalGrant: principal(), idempotencyKey: "idem-a",
});
function agentCard(endpoint: string): A2AAgentCard {
  return {
    schemaVersion: 1, name: "Independent Agent", description: "interop", url: endpoint, version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
    defaultInputModes: ["text"], defaultOutputModes: ["text"],
    skills: [{ id: "echo", name: "Echo", description: "echo" }],
    metadata: { protocolVersion: A2A_REVISION, audience: "remote-agent", internalMarker: "never-leak" },
  };
}
function expectedCardDigest(endpoint: string): string {
  return digest(sanitizeAgentCard(validateAgentCard(agentCard(endpoint))));
}

/** Boots the A2A server as an independent remote agent over real loopback HTTP. */
async function serveIndependentAgent() {
  const httpServer: Server = createServer();
  httpServer.listen(0, "127.0.0.1"); await once(httpServer, "listening");
  const address = httpServer.address();
  if (!address || typeof address === "string") throw new Error("Fixture port unavailable");
  const resource = "http://127.0.0.1:" + address.port + "/a2a";
  const result: TaskResult = { schemaVersion: 1, taskId: "task-a", runId: "run-a", traceId: "trace-a",
    status: "completed", output: { answer: 7 }, usage: { inputTokens: 0, outputTokens: 0 }, evidenceRefs: [] };
  const services: A2AServerServices = {
    async verifyToken(token) {
      if (token !== "resource-token") throw new Error("invalid token");
      return { principal: { ...principal(), audience: "remote-agent" }, audience: "remote-agent",
        resource, expiresAt: new Date(Date.now() + 60000).toISOString() };
    },
    async verifyPrincipal() {},
    async resolveRun() { return context(); },
    async assertRun() {},
    runSignal() { return new AbortController().signal; },
    async executeApprovedTask() { return result; },
    async verifyReceipt() {},
    cancelRun() {},
  };
  const a2a = createA2aServer({ resource, audience: "remote-agent", mode: "fixture", allowedOrigins: [],
    authorizationServers: ["https://auth.example"], services, card: agentCard(resource) });
  httpServer.on("request", (req, res) => { void a2a.nodeHandler(req, res); });
  cleanup.push(async () => { await a2a.close(); httpServer.closeAllConnections();
    await new Promise<void>(resolve => httpServer.close(() => resolve())); });
  return resource;
}

function clientFor(endpoint: string) {
  const services: A2AClientServices = {
    async verifyPrincipal() {},
    async credential() { return { token: "resource-token", audience: "remote-agent", resource: endpoint,
      expiresAt: new Date(Date.now() + 60000).toISOString() }; },
    async approvedRemoteAgents() { return [{ agentId: "agent-1", cardUrl: endpoint,
      cardDigest: expectedCardDigest(endpoint), requiredCapabilities: ["task:execute"] }]; },
    runSignal() { return new AbortController().signal; },
    async assertRun() {},
    async executeRemoteTask(_effect, _principal, dispatch) { return dispatch(); },
    async verifyReceipt() {},
  };
  const api = createA2aClient({ audience: "a2a-client", cardUrl: endpoint, services,
    network: { mode: "fixture", endpoints: [{ endpoint, resource: endpoint, audience: "remote-agent" }] } });
  cleanup.push(() => api.close());
  return api;
}

describe("independent A2A agent interoperability (fixture governance)", () => {
  it("discovers the remote card without leaking metadata", async () => {
    const endpoint = await serveIndependentAgent();
    const card = await clientFor(endpoint).getAgentCard(principal());
    expect(card.name).toBe("Independent Agent");
    expect(card.url).toBe(endpoint);
    expect(card.metadata).toBeUndefined();
  });

  it("executes a task end-to-end against the independent agent", async () => {
    const endpoint = await serveIndependentAgent();
    const result = await clientFor(endpoint).submitRemoteTask(endpoint, task(), principal());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.output).toEqual({ answer: 7 });
  });

  it("rejects a remote agent whose credential is not the issued token", async () => {
    const endpoint = await serveIndependentAgent();
    const services: A2AClientServices = {
      async verifyPrincipal() {},
      async credential() { return { token: "wrong-token", audience: "remote-agent", resource: endpoint,
        expiresAt: new Date(Date.now() + 60000).toISOString() }; },
      async approvedRemoteAgents() { return [{ agentId: "agent-1", cardUrl: endpoint,
        cardDigest: expectedCardDigest(endpoint), requiredCapabilities: ["task:execute"] }]; },
      runSignal() { return new AbortController().signal; },
      async assertRun() {},
      async executeRemoteTask(_effect, _principal, dispatch) { return dispatch(); },
      async verifyReceipt() {},
    };
    const api = createA2aClient({ audience: "a2a-client", cardUrl: endpoint, services,
      network: { mode: "fixture", endpoints: [{ endpoint, resource: endpoint, audience: "remote-agent" }] } });
    cleanup.push(() => api.close());
    await expect(api.submitRemoteTask(endpoint, task(), principal())).rejects.toThrow();
  });
});
