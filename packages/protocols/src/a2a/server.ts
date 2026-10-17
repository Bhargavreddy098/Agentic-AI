import type { IncomingMessage, ServerResponse } from "node:http";
import {
  RunContextSchema, TaskEnvelopeSchema, TaskResultSchema,
  type Principal, type RunContext, type TaskEnvelope, type TaskResult,
} from "@asi/contracts";
import { abortable, checkedEndpoint, checkedPrincipal, positiveBound } from "./auth.js";
import { sanitizeAgentCard, validateAgentCard, type A2AAgentCard } from "./card.js";
import { A2A_REVISION } from "./versions.js";
import { mapLocalToA2a } from "./state-map.js";

export interface AuthenticatedA2aToken {
  principal: Principal;
  audience: string;
  resource: string;
  expiresAt: string;
}

export interface A2AServerServices {
  verifyToken(token: string): Promise<AuthenticatedA2aToken>;
  verifyPrincipal(principal: Principal): Promise<void>;
  /** Trusted ingress resolves a durable run; never accept a caller's RunContext in arguments. */
  resolveRun(principal: Principal): Promise<RunContext>;
  assertRun(principal: Principal, context: RunContext): Promise<void>;
  runSignal(context: RunContext): AbortSignal;
  /** Existing policy/budget/journal/isolated owner; unavailable enforcement denies. */
  executeApprovedTask(task: TaskEnvelope, principal: Principal, context: RunContext, signal: AbortSignal): Promise<TaskResult>;
  verifyReceipt(result: TaskResult, task: TaskEnvelope, principal: Principal, context: RunContext): Promise<void>;
  /** Owner cancels the durable run; no cancellation field on the inbound task. */
  cancelRun(context: RunContext): void;
}

export interface A2AServerConfig {
  resource: string;
  audience: string;
  mode: "live" | "fixture";
  allowedOrigins: readonly string[];
  authorizationServers: readonly string[];
  services: A2AServerServices;
  timeoutMs?: number;
  maxBytes?: number;
  maxActiveRequests?: number;
  /** Public discovery document; served sanitized so discovery never leaks secrets. */
  card?: A2AAgentCard;
}

interface TaskEntry {
  task: TaskEnvelope;
  context: RunContext;
  controller: AbortController;
  result?: TaskResult;
}

const METADATA_PATH = "/.well-known/oauth-protected-resource/a2a";

export function createA2aServer(config: A2AServerConfig) {
  const services = config.services;
  const requiredPorts = ["verifyToken", "verifyPrincipal", "resolveRun", "assertRun",
    "runSignal", "executeApprovedTask", "verifyReceipt", "cancelRun"];
  for (const port of requiredPorts) {
    if (typeof (services as unknown as Record<string, unknown>)[port] !== "function")
      throw new Error(`A2A_SERVER: missing service ${port}`);
  }
  checkedEndpoint(config.resource, { mode: config.mode,
    endpoints: [{ endpoint: config.resource, resource: config.resource, audience: config.audience }] });
  const resource = new URL(config.resource);
  const origins = new Set(config.allowedOrigins.map(origin => {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (config.mode === "live" && parsed.protocol !== "https:"))
      throw new Error("A2A_ORIGIN: invalid origin");
    return origin;
  }));
  if (config.authorizationServers.length < 1 || config.authorizationServers.length > 8)
    throw new Error("A2A_AUTH: required authorization servers");
  const authorizationServers = config.authorizationServers.map(issuer => {
    const url = new URL(issuer);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search)
      throw new Error("A2A_AUTH: invalid authorization server");
    return issuer;
  });
  const maxBytes = positiveBound(config.maxBytes, 131072, 1048576);
  const maxActive = positiveBound(config.maxActiveRequests, 32, 128);
  const timeoutMs = positiveBound(config.timeoutMs, 5000, 60000);
  const lifetime = new AbortController();
  const tasks = new Map<string, TaskEntry>();
  const card = config.card ? sanitizeAgentCard(validateAgentCard(config.card)) : undefined;
  let closed = false;
  let active = 0;

  function refuse(status: number, message: string): Response {
    return Response.json({ error: message }, { status });
  }

  function rpcResult(id: unknown, result: Record<string, unknown>): Response {
    return Response.json({ jsonrpc: "2.0", id, result });
  }

  async function authenticate(request: Request, signal: AbortSignal): Promise<Principal> {
    const header = request.headers.get("authorization") ?? "";
    if (!header.startsWith("Bearer ")) throw new Error("A2A_AUTH: bearer required");
    const token = header.slice(7);
    if (token.length < 1 || token.length > 8192) throw new Error("A2A_AUTH: invalid credential");
    const verified = await abortable(services.verifyToken(token), signal);
    const principal = checkedPrincipal(verified.principal);
    if (verified.resource !== resource.href || verified.audience !== config.audience ||
        principal.audience !== config.audience || !Number.isFinite(Date.parse(verified.expiresAt)))
      throw new Error("A2A_AUTH: resource/audience mismatch");
    await abortable(services.verifyPrincipal(principal), signal);
    return principal;
  }

  async function boundedBody(request: Request): Promise<string> {
    const text = await request.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error("A2A_PAYLOAD: too large");
    return text;
  }

  function asObject(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      throw new Error("A2A_JSON: object required");
    return value as Record<string, unknown>;
  }

  function taskArtifacts(result: TaskResult | undefined): unknown[] {
    return result && result.status === "completed" ? [result.output] : [];
  }

  async function createTask(request: Request, principal: Principal, signal: AbortSignal): Promise<Response> {
    const envelope = asObject(JSON.parse(await boundedBody(request)));
    const params = asObject(envelope.params ?? {});
    const task = TaskEnvelopeSchema.parse(params.task);
    const context = RunContextSchema.parse(await abortable(services.resolveRun(principal), signal));
    if (context.budgetRef.tenantId !== principal.tenantId || task.runContext.budgetRef.tenantId !== principal.tenantId)
      throw new Error("A2A_AUTH: tenant mismatch");
    for (const capability of [...task.requiredCapabilities, ...task.principalGrant.capabilities])
      if (!principal.capabilities.includes(capability)) throw new Error("A2A_AUTH: delegated grant exceeds caller");
    await abortable(services.assertRun(principal, context), signal);
    const controller = new AbortController();
    const taskSignal = AbortSignal.any([signal, lifetime.signal, controller.signal,
      AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Date.parse(context.deadlineAt) - Date.now())))]);
    const entry: TaskEntry = { task, context, controller };
    tasks.set(task.taskId, entry);
    try {
      const result = TaskResultSchema.parse(await abortable(
        services.executeApprovedTask(task, principal, context, taskSignal), taskSignal));
      await abortable(services.verifyReceipt(result, task, principal, context), taskSignal);
      entry.result = result;
      return rpcResult(envelope.id ?? task.taskId,
        { id: task.taskId, status: mapLocalToA2a(result.status), artifacts: taskArtifacts(result) });
    } catch (error) {
      tasks.delete(task.taskId);
      throw error;
    }
  }

  async function fetchRequest(request: Request): Promise<Response> {
    if (closed) return refuse(503, "A2A unavailable");
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (url.host !== resource.host || request.headers.get("host") !== resource.host ||
        (origin !== null && !origins.has(origin))) return new Response("Forbidden", { status: 403 });
    if (url.pathname === METADATA_PATH && request.method === "GET")
      return Response.json({ resource: resource.href, authorization_servers: authorizationServers,
        bearer_methods_supported: ["header"] });
    if (card && url.pathname === resource.pathname && request.method === "GET")
      return Response.json(card);
    const tasksRoot = resource.pathname.replace(/\/+$/, "") + "/tasks";
    if (url.pathname !== tasksRoot && !url.pathname.startsWith(tasksRoot + "/"))
      return new Response("Not found", { status: 404 });
    if (active >= maxActive) return refuse(429, "A2A request limit");

    active++;
    let finished = false;
    const finish = () => { if (!finished) { finished = true; active--; } };
    const timer = setTimeout(finish, timeoutMs);
    try {
      if (request.headers.get("a2a-protocol-version") !== A2A_REVISION)
        return Response.json({ error: "A2A_PROTOCOL_VERSION", supportedVersions: [A2A_REVISION] }, { status: 400 });
      const signal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(timeoutMs)]);
      const principal = await authenticate(request, signal);

      if (url.pathname === tasksRoot && request.method === "POST")
        return await createTask(request, principal, signal);

      if (url.pathname.endsWith("/cancel") && request.method === "POST") {
        const id = decodeURIComponent(url.pathname.slice(tasksRoot.length + 1, -"/cancel".length));
        const entry = tasks.get(id);
        if (!entry) return new Response("Not found", { status: 404 });
        services.cancelRun(entry.context);
        entry.controller.abort();
        return rpcResult(id, { id, status: "canceled", artifacts: [] });
      }

      if (request.method === "GET") {
        const id = decodeURIComponent(url.pathname.slice(tasksRoot.length + 1));
        const entry = tasks.get(id);
        if (!entry) return new Response("Not found", { status: 404 });
        const status = entry.result ? mapLocalToA2a(entry.result.status) : "working";
        return rpcResult(id, { id, status, artifacts: taskArtifacts(entry.result) });
      }

      return new Response("Method not allowed", { status: 405 });
    } catch (error) {
      return refuse(error instanceof Error && error.message.startsWith("A2A_AUTH") ? 401 : 503,
        error instanceof Error ? error.message : "A2A unavailable");
    } finally {
      clearTimeout(timer);
      finish();
    }
  }

  async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (closed) { res.writeHead(503); res.end("A2A unavailable"); return; }
    try {
      const method = req.method ?? "GET";
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += buffer.byteLength;
        if (size > maxBytes) { req.destroy(); res.writeHead(413); res.end("A2A payload too large"); return; }
        chunks.push(buffer);
      }
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }
      const init: RequestInit = { method, headers };
      if (method !== "GET" && method !== "HEAD") init.body = Buffer.concat(chunks);
      const request = new Request(new URL(req.url ?? "/", resource), init);
      const response = await fetchRequest(request);
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => { responseHeaders[key] = value; });
      res.writeHead(response.status, responseHeaders);
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!res.headersSent) { res.writeHead(503); res.end("A2A unavailable"); }
      else res.destroy();
    }
  }

  return {
    fetch: fetchRequest,
    nodeHandler,
    async close() {
      closed = true; lifetime.abort();
      for (const entry of tasks.values()) entry.controller.abort();
      tasks.clear();
    },
  };
}
