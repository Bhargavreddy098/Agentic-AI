// @vitest-environment node
import { beforeAll, afterAll, expect, it } from "vitest";
import { serve } from "@hono/node-server";
import type { ServerType } from "@hono/node-server";
import {
  createUiGateway,
  createMemoryUiPorts,
  createSessionStore,
  createCatalogPorts,
  createManagementCommands,
  type CatalogAdapters,
  type UiCredentialPort,
  type UiUploadLimits,
} from "../../../apps/gateway/src/ui/index.js";
import { HttpGatewayClient } from "../../../apps/web/src/lib/gateway/http-client.js";
import {
  ConnectionViewSchema,
  MemoryViewSchema,
  ModelViewSchema,
  ProviderViewSchema,
  SettingsViewSchema,
  SkillViewSchema,
  UiCommandResultSchema,
  type UiEvent,
} from "../../../packages/contracts/src/ui/index.js";

const realFetch = globalThis.fetch;
const jars = new Map<string, Map<string, string>>();
const limits: UiUploadLimits = { maxMessageBytes: 1_048_576, maxAttachmentBytes: 8, maxAttachmentCount: 2 };
const credentialCalls: Array<{ providerId: string; credential: string }> = [];
let credentialsAvailable = true;

let base = "";
const servers: ServerType[] = [];

const adapters: CatalogAdapters = {
  providers: async () => [{ providerId: "provider-1", displayName: "Local", status: "connected", credentialLabel: "sk-…abcd", revision: 2, allowedActions: ["provider.disconnect"], credentialRef: "secret-ref", apiKey: "sk-live-SECRET", endpoint: "https://internal.invalid" }],
  models: async () => [{ modelId: "model-1", providerId: "provider-1", displayName: "Small", locality: "local", status: "available", preferred: true, revision: 2, allowedActions: ["model.preference.set"], costPerTokenMicroUsd: 3 }],
  skills: async () => [{ skillId: "skill-1", displayName: "Summarize", description: "Summarize text", skillVersion: "1.0.0", status: "enabled", trustStatus: "verified", requiredPermissions: ["model.generate"], revision: 1, allowedActions: ["skill.disable"], signingKeyRef: "key-ref" }],
  connections: async () => [{ connectionId: "connection-1", displayName: "Search", kind: "tool", status: "connected", permissions: ["tool.invoke"], revision: 1, allowedActions: ["connection.disconnect"], tokenRef: "token-ref", secret: "connection-secret" }],
  memory: async () => ({ items: [{ memoryId: "memory-1", scope: "Private", value: "prefers concise answers", sourceIds: ["source-1"], confidence: 0.9, revision: 1, allowedActions: ["memory.correct"], embedding: [0.1, 0.2] }], nextCursor: null }),
  settings: async () => ({ availability: "ready", privacyMode: "local_only", spendLimitMicroUsd: 1000, retentionDays: 30, notifications: true, scheduleEnabled: false, revision: 3, allowedActions: ["settings.update"], encryptionKeyRef: "enc-ref" }),
};

const credentials: UiCredentialPort = {
  async store(_workspaceId, providerId, credential) {
    if (!credentialsAvailable) return { status: "unavailable", reason: "Credential service is unavailable." };
    credentialCalls.push({ providerId, credential });
    return { status: "stored", credentialRef: `ref-${providerId}`, label: "sk-…abcd" };
  },
};

const ports = createMemoryUiPorts();

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
    if (!value || /max-age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
}

function installInterceptor() {
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const requested = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const resolved = requested.startsWith("/") ? base + requested : requested;
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

async function client(assertion: string): Promise<HttpGatewayClient> {
  const response = await fetch(`${base}/api/ui/v1/auth/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assertion }) });
  expect(response.status).toBe(200);
  const gateway = new HttpGatewayClient("live");
  await gateway.getMe();
  return gateway;
}

beforeAll(async () => {
  installInterceptor();
  const catalogs = createCatalogPorts(adapters, { authorization: ports.authorization });
  const commands = createManagementCommands({ control: ports.control, authorization: ports.authorization, credentials });
  const server = serve({ fetch: createUiGateway({ control: ports.control, episodes: ports.episodes, uploads: ports.uploads, auth: ports.auth, catalogs, commands, sessions: createSessionStore(), limits }).fetch, hostname: "127.0.0.1", port: 0 });
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server missing port");
  base = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  for (const server of servers) await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
});

it("returns authorized safe projections that carry only schema fields", async () => {
  const gateway = await client("assert-workspace-a");
  const provider = await gateway.getProviders();
  expect(provider.availability).toBe("ready");
  const providerView = provider.items[0]!;
  expect(ProviderViewSchema.safeParse(providerView).success).toBe(true);
  expect(providerView).not.toHaveProperty("apiKey");
  expect(providerView).not.toHaveProperty("credentialRef");
  expect(providerView).not.toHaveProperty("endpoint");
  expect(ProviderViewSchema.safeParse({ ...providerView, apiKey: "leak" }).success).toBe(false);

  const model = (await gateway.getModels()).items[0]!;
  expect(ModelViewSchema.safeParse(model).success).toBe(true);
  expect(model).not.toHaveProperty("costPerTokenMicroUsd");

  const skill = (await gateway.getSkills()).items[0]!;
  expect(SkillViewSchema.safeParse(skill).success).toBe(true);
  expect(skill).not.toHaveProperty("signingKeyRef");

  const connection = (await gateway.getConnections()).items[0]!;
  expect(ConnectionViewSchema.safeParse(connection).success).toBe(true);
  expect(connection).not.toHaveProperty("tokenRef");
  expect(connection).not.toHaveProperty("secret");

  const memory = (await gateway.queryMemory({ query: "", limit: 10 })).items[0]!;
  expect(MemoryViewSchema.safeParse(memory).success).toBe(true);
  expect(memory).not.toHaveProperty("embedding");

  const settings = await gateway.getSettings();
  expect(SettingsViewSchema.safeParse(settings).success).toBe(true);
  expect(settings).not.toHaveProperty("encryptionKeyRef");
});

it("returns unavailable for unimplemented ports and permission_denied without the read action", async () => {
  const partial = createCatalogPorts({ providers: async () => (await adapters.providers?.()) ?? [] }, { authorization: ports.authorization });
  expect((await partial.skills?.("workspace-a"))?.availability).toBe("unavailable");
  expect((await partial.connections?.("workspace-a"))?.availability).toBe("unavailable");
  const denied = createCatalogPorts(adapters, { authorization: { allowedActions: async () => [] } });
  expect((await denied.providers?.("workspace-a"))?.availability).toBe("permission_denied");
});

it("returns applied, conflict, approval_required and rejected outcomes with stable ids", async () => {
  const gateway = await client("assert-workspace-a");
  const applied = await gateway.submitCommand({ type: "model.preference.set", commandId: "cmd-apply", expectedRevision: 0, modelId: "model-1" });
  expect(applied).toMatchObject({ status: "applied", revision: 1 });
  const replayed = await gateway.submitCommand({ type: "model.preference.set", commandId: "cmd-apply", expectedRevision: 0, modelId: "model-1" });
  expect(replayed).toEqual(applied);

  const conflict = await gateway.submitCommand({ type: "model.preference.set", commandId: "cmd-conflict", expectedRevision: 99, modelId: "model-1" });
  expect(conflict.status).toBe("conflict");

  const approval = await gateway.submitCommand({ type: "skill.install", commandId: "cmd-approval", expectedRevision: 0, skillId: "skill-1", skillVersion: "1.0.0" });
  expect(approval.status).toBe("approval_required");
  expect(UiCommandResultSchema.safeParse(approval).success).toBe(true);
  const replayedApproval = await gateway.submitCommand({ type: "skill.install", commandId: "cmd-approval", expectedRevision: 0, skillId: "skill-1", skillVersion: "1.0.0" });
  expect(replayedApproval).toEqual(approval);

  const stranger = await client("assert-workspace-b");
  const rejected = await stranger.submitCommand({ type: "model.preference.set", commandId: "cmd-rejected", expectedRevision: 0, modelId: "model-1" });
  expect(rejected).toMatchObject({ status: "rejected" });
  if (rejected.status === "rejected") expect(rejected.error.code).toBe("POLICY_DENIED");
});

it("gates provider credentials server-side and keeps the approval preview redacted", async () => {
  const gateway = await client("assert-workspace-a");
  const result = await gateway.submitCommand({ type: "provider.connect", commandId: "cmd-provider", expectedRevision: 0, providerId: "provider-1", credential: "sk-live-SECRET" });
  expect(result.status).toBe("approval_required");
  expect(credentialCalls.some(call => call.credential === "sk-live-SECRET")).toBe(true);
  if (result.status !== "approval_required") throw new Error("approval expected");
  const snapshot = await gateway.getSnapshot(result.conversationId);
  const interaction = snapshot.interactions[0]!;
  if (interaction.type !== "approval") throw new Error("approval interaction expected");
  expect(interaction.version).toBe(result.revision);
  expect(interaction.preview).not.toContain("sk-live-SECRET");
  expect(interaction.preview).toContain("[redacted]");

  const events: UiEvent[] = [];
  for await (const event of gateway.subscribe(result.conversationId, 0, new AbortController().signal)) events.push(event);
  const requested = events.find(event => event.eventType === "approval.requested");
  expect(requested?.payload).toMatchObject({ interactionId: result.interactionId });
});

it("fails closed when the credential service is unavailable", async () => {
  credentialsAvailable = false;
  try {
    const gateway = await client("assert-workspace-a");
    const result = await gateway.submitCommand({ type: "provider.connect", commandId: "cmd-provider-down", expectedRevision: 0, providerId: "provider-1", credential: "sk-live-SECRET" });
    expect(result).toMatchObject({ status: "rejected" });
    if (result.status === "rejected") expect(result.error.code).toBe("DEPENDENCY_UNAVAILABLE");
  } finally {
    credentialsAvailable = true;
  }
});

it("enforces identity and current approval version before a browser decision", async () => {
  const gateway = await client("assert-workspace-a");
  const result = await gateway.submitCommand({ type: "skill.install", commandId: "cmd-decide", expectedRevision: 0, skillId: "skill-1", skillVersion: "1.0.0" });
  if (result.status !== "approval_required") throw new Error("approval expected");
  await expect(gateway.decideApproval(result.interactionId, { commandId: "cmd-stale", expectedVersion: 99, decision: "approve" })).resolves.toMatchObject({ status: "conflict" });
  await expect(gateway.decideApproval(result.interactionId, { commandId: "cmd-ok", expectedVersion: result.revision, decision: "approve" })).resolves.toMatchObject({ status: "applied" });

  const origin = new URL(base).origin;
  jarFor(origin).clear();
  const unauthenticated = await realFetch(`${base}/api/ui/v1/commands`, { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify({ type: "model.preference.set", commandId: "cmd-anon", expectedRevision: 0, modelId: "model-1" }) });
  expect(unauthenticated.status).toBe(401);
});
