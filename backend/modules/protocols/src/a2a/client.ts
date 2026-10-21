import { createHash } from "node:crypto";
import {
  EffectRequestSchema, TaskEnvelopeSchema, TaskResultSchema, ErrorCodeSchema,
  boundedJsonObjectSchema,
  type EffectRequest, type NormalizedError, type Principal, type RunContext,
  type TaskEnvelope, type TaskResult,
} from "@asi/contracts";
import {
  abortable, checkedEndpoint, checkedPrincipal, createA2aFetch, positiveBound,
  type A2AIdentity, type A2ANetwork, type A2AEndpoint,
} from "./auth.js";
import { sanitizeAgentCard, validateAgentCard, type A2AAgentCard } from "./card.js";
import { assertA2aRevision, A2A_REVISION } from "./versions.js";
import { checkedA2aStatus, isTerminalA2aStatus, mapA2aToLocal } from "./state-map.js";

export interface A2ARemoteAgent {
  agentId: string;
  cardUrl: string;
  cardDigest: string;
  requiredCapabilities: readonly string[];
}

/** Owner must verify card signature/digest, approval and revocation, and fence effects. */
export interface A2AClientServices extends A2AIdentity {
  approvedRemoteAgents(principal: Principal, resource: string): Promise<readonly A2ARemoteAgent[]>;
  runSignal(context: RunContext): AbortSignal;
  assertRun(principal: Principal, context: RunContext): Promise<void>;
  /**
   * Existing trusted execution owner: immutable intent, policy/approval, atomic
   * budget, at-most-one dispatch attempt, durable outcome and a real receipt.
   * On recovery it reconciles the deterministic intent instead of replaying it.
   */
  executeRemoteTask(effect: EffectRequest, principal: Principal, dispatch: () => Promise<TaskResult>): Promise<TaskResult>;
  /** Verify signature and exact tenant/run/task/input/output/status binding. */
  verifyReceipt(effect: EffectRequest, result: TaskResult, principal: Principal): Promise<void>;
}

export interface A2AClientConfig {
  audience: string;
  cardUrl: string;
  network: A2ANetwork;
  services: A2AClientServices;
  maxConcurrent?: number;
  pollIntervalMs?: number;
}

export interface A2AClientAdapter {
  getAgentCard(principal: Principal): Promise<A2AAgentCard>;
  submitRemoteTask(cardUrl: string, task: TaskEnvelope, principal: Principal): Promise<TaskResult>;
  close(): Promise<void>;
}

export function requirePorts(value: unknown, names: readonly string[]): void {
  if (!value || names.some(name => typeof (value as Record<string, unknown>)[name] !== "function"))
    throw new Error("A2A_GOVERNANCE: required enforcement unavailable");
}

export function jsonObject(input: unknown, maxBytes = 65536): Record<string, unknown> {
  return JSON.parse(JSON.stringify(boundedJsonObjectSchema(maxBytes).parse(input))) as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("A2A_JSON: object required");
  return value as Record<string, unknown>;
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function remoteArtifacts(payload: Record<string, unknown>): Record<string, unknown>[] {
  const list = payload.artifacts;
  if (!Array.isArray(list)) return [];
  return list.slice(0, 64).map(item => jsonObject(item, 1048576));
}

function remoteError(payload: Record<string, unknown>): Record<string, unknown> | null {
  const value = payload.error;
  if (value === undefined || value === null) return null;
  return asObject(value);
}

function toTaskResult(task: TaskEnvelope, status: TaskResult["status"],
  artifacts: Record<string, unknown>[], failure: Record<string, unknown> | null): TaskResult {
  const base = {
    schemaVersion: 1 as const, taskId: task.taskId, runId: task.runContext.runId, traceId: task.traceId,
    usage: { inputTokens: 0, outputTokens: 0 }, evidenceRefs: [] as [],
  };
  if (status === "completed") return TaskResultSchema.parse({ ...base, status, output: artifacts[0] ?? {} });
  if (status === "unknown") return TaskResultSchema.parse({ ...base, status });
  const code = failure ? ErrorCodeSchema.safeParse(failure.code) : undefined;
  const error: NormalizedError = {
    code: code && code.success ? code.data : "UNKNOWN_OUTCOME",
    safeMessage: typeof failure?.message === "string" && failure.message.length > 0
      ? failure.message.slice(0, 1024) : "Remote task did not complete",
    retryable: status !== "cancelled",
  };
  return TaskResultSchema.parse({ ...base, status, error });
}

export function createA2aClient(config: A2AClientConfig): A2AClientAdapter {
  requirePorts(config.services, ["verifyPrincipal", "credential", "approvedRemoteAgents",
    "runSignal", "assertRun", "executeRemoteTask", "verifyReceipt"]);
  if (!config.audience) throw new Error("A2A_AUTH: required audience");
  const services = config.services;
  const network: A2ANetwork = { ...config.network, endpoints: config.network.endpoints.map(item => ({ ...item })) };
  const maxConcurrent = positiveBound(config.maxConcurrent, 4, 16);
  const timeoutMs = positiveBound(network.timeoutMs, 5000, 60000);
  const pollIntervalMs = positiveBound(config.pollIntervalMs, 250, 5000);
  const lifetime = new AbortController();
  let active = 0;
  let closed = false;

  async function approvedAgent(principal: Principal, resource: string): Promise<A2ARemoteAgent> {
    const approved = await services.approvedRemoteAgents(principal, resource);
    if (!Array.isArray(approved) || approved.length < 1 || approved.length > 16)
      throw new Error("A2A_APPROVAL: no approved remote agents");
    const match = approved.find(agent => agent.cardUrl === resource);
    if (!match) throw new Error("A2A_APPROVAL: remote agent not approved");
    return match;
  }

  async function resolveCard(principal: Principal, cardUrl: string): Promise<A2AAgentCard> {
    const endpoint = checkedEndpoint(cardUrl, network);
    const approved = await approvedAgent(principal, endpoint.resource);
    const request = createA2aFetch(endpoint, principal, services, network);
    const signal = AbortSignal.any([AbortSignal.timeout(timeoutMs)]);
    const response = await abortable(request(cardUrl, { method: "GET" }), signal);
    if (!response.ok) throw new Error("A2A_CARD: discovery failed");
    const card = validateAgentCard(await response.json());
    const metadata = card.metadata ?? {};
    const advertisedAudience = asObject(metadata).audience;
    if (advertisedAudience !== undefined && advertisedAudience !== endpoint.audience)
      throw new Error("A2A_AUTH: card audience mismatch");
    assertA2aRevision(asObject(metadata).protocolVersion ?? A2A_REVISION);
    if (new URL(card.url).href !== cardUrl) throw new Error("A2A_CARD: card url mismatch");
    const sanitized = sanitizeAgentCard(card);
    if (digest(sanitized) !== approved.cardDigest) throw new Error("A2A_APPROVAL: card digest changed");
    return sanitized;
  }

  async function getAgentCard(input: Principal): Promise<A2AAgentCard> {
    const principal = checkedPrincipal(input);
    await services.verifyPrincipal(principal);
    return resolveCard(principal, config.cardUrl);
  }

  async function dispatchRemoteTask(endpoint: A2AEndpoint, task: TaskEnvelope, principal: Principal): Promise<TaskResult> {
    const runContext = task.runContext;
    const signal = AbortSignal.any([lifetime.signal, services.runSignal(runContext),
      AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, Date.parse(runContext.deadlineAt) - Date.now())))]);
    const request = createA2aFetch(endpoint, principal, services, network);
    const submitted = await abortable(request(endpoint.endpoint + "/tasks", {
      method: "POST",
      headers: { "content-type": "application/json", "a2a-protocol-version": A2A_REVISION },
      body: JSON.stringify({
        jsonrpc: "2.0", id: task.taskId, method: "tasks/send", params: { task },
      }),
      signal,
    }), signal);
    if (!submitted.ok) throw new Error("A2A_SUBMIT: remote rejected task");
    const envelope = asObject(jsonObject(await submitted.json()));
    const body = asObject(envelope.result ?? envelope);
    const remoteId = body.id ?? body.taskId;
    if (typeof remoteId !== "string" || remoteId.length < 1 || remoteId.length > 256)
      throw new Error("A2A_SUBMIT: missing durable remote task id");
    let status = checkedA2aStatus(body.status);
    let artifacts = remoteArtifacts(body);
    let failure = remoteError(body);
    while (!isTerminalA2aStatus(status)) {
      signal.throwIfAborted();
      await abortable(delay(pollIntervalMs), signal);
      const polled = await abortable(request(endpoint.endpoint + "/tasks/" + encodeURIComponent(remoteId), {
        method: "GET", signal,
      }), signal);
      if (!polled.ok) throw new Error("A2A_STATUS: poll failed");
      const state = asObject(asObject(jsonObject(await polled.json())).result ?? {});
      status = checkedA2aStatus(state.status);
      artifacts = remoteArtifacts(state);
      failure = remoteError(state);
    }
    return toTaskResult(task, mapA2aToLocal(status), artifacts, failure);
  }

  async function submitRemoteTask(cardUrl: string, input: TaskEnvelope, inputPrincipal: Principal): Promise<TaskResult> {
    if (closed || active >= maxConcurrent) throw new Error("A2A_HANDLE_LIMIT");
    const principal = checkedPrincipal(inputPrincipal);
    const task = TaskEnvelopeSchema.parse(jsonObject(input));
    if (task.runContext.budgetRef.tenantId !== principal.tenantId) throw new Error("A2A_AUTH: tenant mismatch");
    for (const capability of [...task.requiredCapabilities, ...task.principalGrant.capabilities])
      if (!principal.capabilities.includes(capability)) throw new Error("A2A_AUTH: delegated grant exceeds caller");
    const endpoint = checkedEndpoint(cardUrl, network);
    await resolveCard(principal, cardUrl);
    const approved = await approvedAgent(principal, endpoint.resource);
    if (!approved.requiredCapabilities.every(capability => principal.capabilities.includes(capability)))
      throw new Error("A2A_AUTH: remote agent capabilities exceed caller");
    await services.verifyPrincipal(principal);
    await services.assertRun(principal, task.runContext);

    active++;
    try {
      const inputHash = digest(task.input);
      const key = digest({ resource: endpoint.resource, taskId: task.taskId, runId: task.runContext.runId,
        sessionId: task.runContext.sessionId, tenantId: principal.tenantId, inputHash });
      const effect = EffectRequestSchema.parse({
        schemaVersion: 1, effectId: "a2a-task-" + key, action: "a2a.task.submit",
        resource: "a2a-" + digest(endpoint.resource), inputHash, runContext: task.runContext,
        idempotencyKey: task.idempotencyKey, traceId: task.traceId,
        requiredCapabilities: task.requiredCapabilities,
      });
      const result = TaskResultSchema.parse(await services.executeRemoteTask(effect, principal,
        () => dispatchRemoteTask(endpoint, task, principal)));
      await services.verifyReceipt(effect, result, principal);
      return result;
    } finally { active--; }
  }

  async function close(): Promise<void> {
    closed = true;
    lifetime.abort();
  }

  return { getAgentCard, submitRemoteTask, close };
}
