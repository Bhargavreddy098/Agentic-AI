import type { IncomingMessage, ServerResponse } from "node:http";
import {
  McpServer, createMcpHandler, fromJsonSchema, requireBearerAuth, OAuthError,
  getOAuthProtectedResourceMetadataUrl, type JsonSchemaType,
} from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { RunContextSchema, ToolResultSchema, type Principal, type RunContext, type ToolManifest, type ToolResult } from "@asi/contracts";
import { abortable, checkedEndpoint, checkedPrincipal, positiveBound } from "./auth.js";
import { checkedManifest, digest, jsonObject, requirePorts, validateJson } from "./client.js";
import { MCP_REVISION } from "./versions.js";

export interface AuthenticatedMcpToken {
  principal: Principal;
  audience: string;
  resource: string;
  expiresAt: string;
}
export interface McpServerServices {
  verifyToken(token: string): Promise<AuthenticatedMcpToken>;
  verifyPrincipal(principal: Principal): Promise<void>;
  approvedTools(principal: Principal, resource: string): Promise<readonly ToolManifest[]>;
  /** Trusted ingress resolves a durable run; never accept a caller's RunContext in arguments. */
  resolveRun(principal: Principal): Promise<RunContext>;
  assertRun(principal: Principal, context: RunContext): Promise<void>;
  runSignal(context: RunContext): AbortSignal;
  /** Existing policy/budget/journal/isolated tool owner; unavailable enforcement denies. */
  executeApprovedTool(manifest: ToolManifest, input: Record<string, unknown>, principal: Principal,
    context: RunContext, signal: AbortSignal): Promise<ToolResult>;
  verifyReceipt(result: ToolResult, manifest: ToolManifest, input: Record<string, unknown>,
    principal: Principal, context: RunContext): Promise<void>;
}
export interface McpServerConfig {
  resource: string;
  audience: string;
  mode: "live" | "fixture";
  allowedOrigins: readonly string[];
  authorizationServers: readonly string[];
  services: McpServerServices;
  timeoutMs?: number;
  maxBytes?: number;
  maxTools?: number;
  maxActiveRequests?: number;
}
export function createMcpServer(config: McpServerConfig) {
  const services = config.services;
  requirePorts(services, ["verifyToken", "verifyPrincipal", "approvedTools", "resolveRun",
    "assertRun", "runSignal", "executeApprovedTool", "verifyReceipt"]);
  checkedEndpoint(config.resource, { mode: config.mode,
    endpoints: [{ endpoint: config.resource, resource: config.resource, audience: config.audience }] });
  const resource = new URL(config.resource);
  const origins = new Set(config.allowedOrigins.map(origin => {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || (config.mode === "live" && parsed.protocol !== "https:"))
      throw new Error("MCP_ORIGIN: invalid origin");
    return origin;
  }));
  if (config.authorizationServers.length < 1 || config.authorizationServers.length > 8)
    throw new Error("MCP_AUTH: required authorization servers");
  const authorizationServers = config.authorizationServers.map(issuer => {
    const url = new URL(issuer);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search)
      throw new Error("MCP_AUTH: invalid authorization server");
    return issuer;
  });
  const maxBytes = positiveBound(config.maxBytes, 131072, 1048576);
  const maxTools = positiveBound(config.maxTools, 64, 128);
  const maxActive = positiveBound(config.maxActiveRequests, 32, 128);
  const timeoutMs = positiveBound(config.timeoutMs, 5000, 60000);
  const metadataUrl = getOAuthProtectedResourceMetadataUrl(resource);
  const lifetime = new AbortController();
  let closed = false, active = 0;

  const gate = requireBearerAuth({
    resourceMetadataUrl: metadataUrl, expectedResource: resource,
    verifier: { async verifyAccessToken(token) {
      try {
        if (token.length > 8192) throw new Error("oversized token");
        const verified = await services.verifyToken(token);
        const principal = checkedPrincipal(verified.principal);
        if (verified.resource !== resource.href || verified.audience !== config.audience ||
            principal.audience !== config.audience || !Number.isFinite(Date.parse(verified.expiresAt)))
          throw new Error("resource/audience mismatch");
        await services.verifyPrincipal(principal);
        return { token, clientId: principal.subjectId, scopes: principal.capabilities,
          expiresAt: Math.min(Date.parse(verified.expiresAt), Date.parse(principal.expiresAt)) / 1000,
          resource, extra: { principal } };
      } catch { throw new OAuthError("invalid_token", "Invalid resource credential"); }
    } },
  });
  async function approved(principal: Principal, signal: AbortSignal): Promise<ToolManifest[]> {
    const candidates = await abortable(services.approvedTools(principal, resource.href), signal);
    if (!Array.isArray(candidates) || candidates.length > maxTools) throw new Error("MCP_TOOL_LIMIT");
    const manifests = candidates.map(checkedManifest);
    if (new Set(manifests.map(item => item.toolId)).size !== manifests.length)
      throw new Error("MCP_MANIFEST: duplicate tool");
    return manifests.filter(manifest => manifest.requiredCapabilities.every(capability => principal.capabilities.includes(capability)));
  }
  const handler = createMcpHandler(async requestContext => {
    try {
    const principal = checkedPrincipal(requestContext.authInfo?.extra?.principal as Principal);
    const request = requestContext.requestInfo;
    if (requestContext.era !== "modern" || !request) throw new Error("MCP_PROTOCOL_VERSION");
    const requestSignal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(timeoutMs)]);
    const manifests = await approved(principal, requestSignal);
    const server = new McpServer({ name: "asi-approved-tools", version: "0.1.0" }, { capabilities: { tools: {} } });
    for (const manifest of manifests) {
      server.registerTool(manifest.toolId, {
        inputSchema: fromJsonSchema(manifest.inputSchema as JsonSchemaType),
        outputSchema: fromJsonSchema(manifest.outputSchema as JsonSchemaType),
      }, async (untrusted: unknown, sdkContext) => {
        try {
        const context = RunContextSchema.parse(jsonObject(await abortable(services.resolveRun(principal), requestSignal)));
        const signal = AbortSignal.any([requestSignal, sdkContext.mcpReq.signal, services.runSignal(context),
          AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Date.parse(context.deadlineAt) - Date.now())))]);
        async function guard() {
          signal.throwIfAborted(); checkedPrincipal(principal); RunContextSchema.parse(context);
          if (context.budgetRef.tenantId !== principal.tenantId) throw new Error("MCP_AUTH: tenant mismatch");
          await abortable(services.verifyPrincipal(principal), signal);
          await abortable(services.assertRun(principal, context), signal);
          const latest = (await approved(principal, signal)).find(item => item.toolId === manifest.toolId);
          if (!latest || digest(latest) !== digest(manifest)) throw new Error("MCP_MANIFEST: approval revoked/changed");
        }
        await guard();
        const input = validateJson(manifest.inputSchema, untrusted);
        const result = ToolResultSchema.parse(await abortable(
          services.executeApprovedTool(manifest, input, principal, context, signal), signal));
        if (result.toolId !== manifest.toolId) throw new Error("MCP_RECEIPT: tool mismatch");
        await abortable(services.verifyReceipt(result, manifest, input, principal, context), signal);
        await guard();
        if (result.status !== "succeeded")
          return { isError: true, content: [{ type: "text" as const, text: "Tool effect failed or requires reconciliation." }] };
        const output = validateJson(manifest.outputSchema, JSON.parse(result.content));
        return { content: [{ type: "text" as const, text: JSON.stringify(output) }], structuredContent: output };
        } catch { throw new Error("MCP tool effect unavailable; reconciliation may be required"); }
      });
    }
    return server;
    } catch { throw new Error("MCP approved tools unavailable"); }
  }, { legacy: "reject", maxRequestBodySize: maxBytes, maxSubscriptions: 1, keepAliveMs: 10000 });
  async function fetchRequest(request: Request): Promise<Response> {
    if (closed) return new Response("MCP unavailable", { status: 503 });
    const url = new URL(request.url);
    const origin = request.headers.get("origin");
    if (url.host !== resource.host || request.headers.get("host") !== resource.host ||
        (origin !== null && !origins.has(origin))) return new Response("Forbidden", { status: 403 });
    if (request.url === metadataUrl && request.method === "GET")
      return Response.json({ resource: resource.href, authorization_servers: authorizationServers,
        bearer_methods_supported: ["header"] });
    if (request.url !== resource.href) return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
    if (request.headers.get("mcp-protocol-version") !== MCP_REVISION)
      return Response.json({ error: "MCP_PROTOCOL_VERSION", supportedVersions: [MCP_REVISION] }, { status: 400 });
    if (!["server/discover", "tools/list", "tools/call"].includes(request.headers.get("mcp-method") ?? ""))
      return new Response("Method not allowed", { status: 405 });
    if (active >= maxActive) return new Response("MCP request limit", { status: 429 });
    active++;
    let finished = false;
    let detachAbort = () => {};
    const finish = () => { if (!finished) { finished = true; detachAbort(); active--; } };
    try {
      const signal = AbortSignal.any([request.signal, lifetime.signal, AbortSignal.timeout(timeoutMs)]);
      const auth = await abortable(gate(request), signal);
      if (auth instanceof Response) { finish(); return auth; }
      const response = await abortable(handler.fetch(new Request(request, { signal }), { authInfo: auth }), signal);
      if (!response.body) { finish(); return response; }
      const reader = response.body.getReader();
      let bytes = 0, terminal = false;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const onAbort = () => {
            if (terminal) return;
            terminal = true; finish();
            controller.error(new Error("MCP response interrupted"));
            void reader.cancel().catch(() => {});
          };
          detachAbort = () => signal.removeEventListener("abort", onAbort);
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        },
        async pull(controller) {
          try {
            const next = await abortable(reader.read(), signal);
            if (terminal) return;
            if (next.done) { terminal = true; finish(); controller.close(); return; }
            bytes += next.value.byteLength;
            if (bytes > maxBytes) throw new Error("MCP_OUTPUT_LIMIT");
            controller.enqueue(next.value);
          } catch {
            if (!terminal) { terminal = true; finish(); controller.error(new Error("MCP response interrupted")); }
            await reader.cancel().catch(() => {});
          }
        },
        async cancel() { terminal = true; finish(); await reader.cancel(); },
      });
      return new Response(body, { status: response.status, headers: response.headers });
    } catch {
      finish(); return new Response("MCP unavailable", { status: 503 });
    }
  }
  const bridge = toNodeHandler({ fetch: fetchRequest }, { maxRequestBodySize: maxBytes });
  let ingesting = 0;
  const admitted = new Set<() => void>();
  async function nodeHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    function refuse(status: number) {
      // Flush the bounded error before terminating an unfinished request body.
      res.once("finish", () => { req.destroy(); });
      res.writeHead(status); res.end("MCP unavailable");
    }
    if (closed) { refuse(503); return; }
    if (typeof req.method !== "string" || typeof req.url !== "string") { refuse(400); return; }
    if (ingesting >= maxActive) { refuse(429); return; }
    ingesting++;
    let released = false;
    const finish = () => {
      if (released) return;
      released = true; clearTimeout(timer); ingesting--; admitted.delete(stop);
      res.removeListener("finish", finish); res.removeListener("close", finish);
    };
    const stop = () => {
      if (released) return;
      if (!res.headersSent) refuse(408);
      else { res.destroy(); req.destroy(); }
      finish();
    };
    const timer = setTimeout(stop, timeoutMs);
    admitted.add(stop);
    res.once("finish", finish); res.once("close", finish);
    try { await bridge(req as IncomingMessage & { method: string; url: string }, res); }
    catch {
      if (!res.headersSent && !res.destroyed) refuse(503);
      else { res.destroy(); req.destroy(); }
      finish();
    }
  }
  return {
    fetch: fetchRequest,
    nodeHandler,
    async close() { closed = true; lifetime.abort(); for (const stop of admitted) stop(); await handler.close(); },
  };
}
