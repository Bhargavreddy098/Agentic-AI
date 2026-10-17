import { createHash, randomUUID } from "node:crypto";
import { Client, StreamableHTTPClientTransport, type Tool, type JsonSchemaType } from "@modelcontextprotocol/client";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/client/validators/ajv";
import {
  EffectRequestSchema, RunContextSchema, ToolManifestSchema, ToolResultSchema,
  boundedJsonObjectSchema, type EffectRequest, type Principal, type RunContext,
  type ToolManifest, type ToolResult,
} from "@asi/contracts";
import {
  abortable, checkedEndpoint, checkedPrincipal, createMcpFetch, positiveBound,
  type McpIdentity, type McpNetwork, type McpEndpoint,
} from "./auth.js";
import { MCP_REVISION } from "./versions.js";

export interface McpRemoteOutput {
  /** Untrusted, validated JSON text. Never interpreted as instructions. */
  content: string;
  structuredContent: Record<string, unknown>;
}
export interface McpGovernance extends McpIdentity {
  /** Owner must verify publisher signature, artifact digest, approval and revocation. */
  approvedTools(principal: Principal, resource: string): Promise<readonly ToolManifest[]>;
  /** Trusted broker supplies run cancellation; no cancellation field in tool input. */
  runSignal(context: RunContext): AbortSignal;
  /** Must fence the current writer against the durable tenant/session/run lease. */
  assertRun(principal: Principal, context: RunContext): Promise<void>;
  /**
   * Existing trusted execution owner: immutable intent, policy/approval, atomic
   * budget, authorized isolation, at-most-one dispatch attempt, durable outcome
   * (including unknown) and a real signed receipt. No fallback implementation.
   * On recovery it reconciles the deterministic intent instead of replaying it.
   */
  executeEffect(effect: EffectRequest, principal: Principal, dispatch: () => Promise<McpRemoteOutput>): Promise<ToolResult>;
  /** Verify signature and exact tenant/run/effect/input/output/status binding. */
  verifyReceipt(effect: EffectRequest, result: ToolResult, principal: Principal): Promise<void>;
}
export interface McpClientConfig {
  audience: string;
  network: McpNetwork;
  services: McpGovernance;
  maxHandles?: number;
  maxTools?: number;
}
export interface McpClientAdapter {
  connectMcpServer(endpoint: string, principal: Principal): Promise<{ serverId: string }>;
  callMcpTool(serverId: string, toolName: string, input: unknown, context: RunContext): Promise<ToolResult>;
  close(): Promise<void>;
}
export function requirePorts(value: unknown, names: readonly string[]): void {
  if (!value || names.some(name => typeof (value as Record<string, unknown>)[name] !== "function"))
    throw new Error("MCP_GOVERNANCE: required enforcement unavailable");
}
export function jsonObject(input: unknown, maxBytes = 65536): Record<string, unknown> {
  return JSON.parse(JSON.stringify(boundedJsonObjectSchema(maxBytes).parse(input))) as Record<string, unknown>;
}
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, sorted(v)]));
  return value;
}
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(sorted(value))).digest("hex");
}
export function checkedManifest(input: ToolManifest): ToolManifest {
  const manifest = ToolManifestSchema.parse(jsonObject(input));
  jsonObject(manifest.inputSchema); jsonObject(manifest.outputSchema);
  if (manifest.executionClass !== "isolated" || !/^[A-Za-z0-9_.-]{1,128}$/.test(manifest.toolId) ||
      manifest.inputSchema.type !== "object" || manifest.outputSchema.type !== "object")
    throw new Error("MCP_MANIFEST: unqualified tool/schema");
  return manifest;
}
export function validateJson(schema: Record<string, unknown>, value: unknown): Record<string, unknown> {
  const object = jsonObject(value);
  const validate = new AjvJsonSchemaValidator().getValidator(schema as JsonSchemaType);
  if (!validate(object).valid) throw new Error("MCP_SCHEMA: invalid tool input/output");
  return object;
}
interface Connection {
  client: Client;
  endpoint: McpEndpoint;
  principal: Principal;
  tools: Map<string, Tool>;
}

export function createMcpClient(config: McpClientConfig): McpClientAdapter {
  requirePorts(config.services, ["verifyPrincipal", "credential", "approvedTools", "runSignal", "assertRun", "executeEffect", "verifyReceipt"]);
  if (!config.audience) throw new Error("MCP_AUTH: required audience");
  const services = config.services;
  // Snapshot trusted configuration; callers cannot expand destinations after construction.
  const network: McpNetwork = { ...config.network, endpoints: config.network.endpoints.map(item => ({ ...item })) };
  const maxHandles = positiveBound(config.maxHandles, 16, 128);
  const maxTools = positiveBound(config.maxTools, 64, 128);
  const timeoutMs = positiveBound(network.timeoutMs, 5000, 60000);
  const connections = new Map<string, Connection>();
  const clients = new Set<Client>();
  const lifetime = new AbortController();
  let pending = 0;
  let closed = false;

  async function currentTools(principal: Principal, resource: string): Promise<Map<string, ToolManifest>> {
    const approved = await services.approvedTools(principal, resource);
    if (!Array.isArray(approved) || approved.length > maxTools) throw new Error("MCP_TOOL_LIMIT");
    const result = new Map<string, ToolManifest>();
    for (const candidate of approved) {
      const manifest = checkedManifest(candidate);
      if (result.has(manifest.toolId)) throw new Error("MCP_MANIFEST: duplicate tool");
      if (manifest.requiredCapabilities.every(capability => principal.capabilities.includes(capability)))
        result.set(manifest.toolId, manifest);
    }
    return result;
  }
  async function connectMcpServer(endpoint: string, input: Principal): Promise<{ serverId: string }> {
    if (closed || connections.size + pending >= maxHandles) throw new Error("MCP_HANDLE_LIMIT");
    pending++;
    const client = new Client({ name: "asi-governed-mcp", version: "0.1.0" }, {
      versionNegotiation: { mode: { pin: MCP_REVISION }, probe: { maxRetries: 0 } },
      capabilities: {}, listMaxPages: 1, inputRequired: { autoFulfill: false },
    });
    clients.add(client);
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(timeoutMs)]);
    try {
      const resource = checkedEndpoint(endpoint, network);
      const principal = checkedPrincipal(jsonObject(input) as Principal);
      if (principal.audience !== config.audience) throw new Error("MCP_AUTH: audience mismatch");
      await abortable(services.verifyPrincipal(principal), signal);
      const approved = await abortable(currentTools(principal, resource.resource), signal);
      const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
        fetch: createMcpFetch(resource, principal, services, network),
        protocolVersion: MCP_REVISION, requestInit: { redirect: "error" },
        onInsufficientScope: "throw", maxStepUpRetries: 0,
        reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 },
      });
      await client.connect(transport, { signal, timeout: timeoutMs });
      const listed = await client.listTools(undefined, { signal, timeout: timeoutMs, cacheMode: "bypass" });
      if (listed.tools.length > maxTools) throw new Error("MCP_TOOL_LIMIT");
      const tools = new Map<string, Tool>();
      for (const tool of listed.tools) {
        if (tools.has(tool.name)) throw new Error("MCP_MANIFEST: duplicate remote tool");
        const local = approved.get(tool.name);
        if (!local) continue;
        if (digest(tool.inputSchema) !== digest(local.inputSchema) || digest(tool.outputSchema) !== digest(local.outputSchema))
          throw new Error("MCP_SCHEMA: remote definition differs from approval");
        tools.set(tool.name, tool);
      }
      signal.throwIfAborted();
      const serverId = randomUUID();
      connections.set(serverId, { client, endpoint: resource, principal, tools });
      return { serverId };
    } catch (error) { clients.delete(client); await client.close(); throw error; }
    finally { pending--; }
  }

  async function callMcpTool(serverId: string, toolName: string, input: unknown, run: RunContext): Promise<ToolResult> {
    const connection = connections.get(serverId);
    if (closed || !connection) throw new Error("MCP_HANDLE: unknown server");
    const context = RunContextSchema.parse(jsonObject(run));
    const principal = checkedPrincipal(connection.principal);
    if (context.budgetRef.tenantId !== principal.tenantId) throw new Error("MCP_AUTH: tenant mismatch");
    const signal = AbortSignal.any([lifetime.signal, services.runSignal(context),
      AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Date.parse(context.deadlineAt) - Date.now())))]);
    async function guard(): Promise<ToolManifest> {
      signal.throwIfAborted(); checkedPrincipal(principal); RunContextSchema.parse(context);
      await abortable(services.verifyPrincipal(principal), signal);
      await abortable(services.assertRun(principal, context), signal);
      const manifest = (await abortable(currentTools(principal, connection!.endpoint.resource), signal)).get(toolName);
      if (!manifest || !connection!.tools.has(toolName)) throw new Error("MCP_TOOL: unknown or revoked tool");
      return manifest;
    }
    const manifest = await guard();
    const args = validateJson(manifest.inputSchema, input);
    // Stable per run/resource/tool/input: recovery is the owner's reconciliation,
    // never a fresh effect just because a transport or writer epoch changed.
    const key = digest({ resource: connection.endpoint.resource, toolName, args,
      runId: context.runId, sessionId: context.sessionId, tenantId: principal.tenantId });
    const effect = EffectRequestSchema.parse({ schemaVersion: 1, effectId: "mcp-" + key,
      action: "mcp.tool.call", resource: "mcp-" + digest(connection.endpoint.resource),
      inputHash: digest(args), artifactHash: manifest.artifactDigest, runContext: context,
      idempotencyKey: key, traceId: context.runId, requiredCapabilities: manifest.requiredCapabilities });
    let dispatched = false;
    const result = ToolResultSchema.parse(await abortable(services.executeEffect(effect, principal, async () => {
      if (dispatched) throw new Error("MCP_RETRY: effect dispatch already attempted");
      const latest = await guard();
      if (digest(latest) !== digest(manifest)) throw new Error("MCP_MANIFEST: approval changed");
      dispatched = true;
      const remote = await connection.client.callTool({ name: toolName, arguments: args }, {
        signal, timeout: Math.max(1, Math.min(timeoutMs, Date.parse(context.deadlineAt) - Date.now())),
        toolDefinition: connection.tools.get(toolName)!,
      });
      await guard();
      if (remote.isError) throw new Error("MCP_REMOTE: untrusted tool error");
      const structuredContent = validateJson(manifest.outputSchema, remote.structuredContent);
      return { content: JSON.stringify(structuredContent), structuredContent };
    }), signal));
    if (result.toolId !== manifest.toolId) throw new Error("MCP_RECEIPT: tool binding mismatch");
    if (result.status === "succeeded") validateJson(manifest.outputSchema, JSON.parse(result.content));
    await abortable(services.verifyReceipt(effect, result, principal), signal);
    await guard();
    return result;
  }
  async function close(): Promise<void> {
    closed = true; lifetime.abort(); connections.clear();
    const results = await Promise.allSettled([...clients].map(client => client.close()));
    clients.clear();
    if (results.some(result => result.status === "rejected")) throw new Error("MCP_CLOSE: transport cleanup failed");
  }
  return { connectMcpServer, callMcpTool, close };
}
