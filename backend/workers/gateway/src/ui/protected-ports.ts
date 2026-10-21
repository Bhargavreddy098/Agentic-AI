import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  EffectRequestSchema,
  UiEventSchema,
  type ApprovalDecisionInput,
  type ClarificationAnswer,
  type ClarificationRequest,
  type ConversationPatch,
  type ConversationSummary,
  type EffectRequest,
  type Interaction,
  type Page,
  type PolicyDecision,
  type Principal,
  type SendMessageInput,
  type UiApprovalRequest,
  type UiCommandResult,
  type UiEvent,
  type UiEventType,
  type UiMessage,
  type UiMutationCommand,
} from "@asi/contracts";
import { evaluatePolicy, type PolicyConfig } from "@asi/policy";
import { normalizedError } from "./errors.js";
import { projectSummary } from "./project.js";
import { createMemoryUiPorts, type MemoryUiPortOptions, type MemoryUiPorts } from "./memory-ports.js";
import { isGatedCommand, redactCommand } from "./commands/management.js";
import type { RunStatus, UiControlPort, UiConversationRecord, UiEpisodePort, UiPrincipal } from "./ports.js";

export interface ProtectedUiPortsOptions extends MemoryUiPortOptions {
  signingKey?: Uint8Array;
  effectDelayMs?: number;
}

const POLICY_VERSION = "policy-protected-v1";
const CAPABILITY = "effect:read";
const ACTION_READ = "effect.read";
const ACTION_DENIED = "effect.denied";
const RESOURCE_READ = "protected/workspace-document";
const RESOURCE_DENIED = "protected/denied";
const RECEIPT_KEY_ID = "gateway-protected-receipt-v1";
const TERMINAL_RUN_STATUSES: readonly RunStatus[] = ["completed", "failed", "cancelled", "budget_exhausted"];

const WORKSPACE_ACTIONS: Record<string, string[]> = {
  "workspace-a": ["chat", "conversation.create", "message.send", "upload.write", "catalog.read", "catalog.manage"],
  "workspace-b": ["chat", "conversation.create", "message.send", "upload.write", "catalog.read"],
};

const nowIso = () => new Date().toISOString();
const newId = (kind: string) => `${kind}-${randomUUID()}`;
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * Read-only protected-effect policy evaluated by the real policy kernel. `effect:read` is
 * allowed so an approved action can be authorized; the explicit deny rule makes the denial
 * path a real policy refusal rather than a rendered message.
 */
export function protectedEffectPolicy(): PolicyConfig {
  return {
    version: POLICY_VERSION,
    defaultEffect: "deny",
    rules: [
      { capability: CAPABILITY, effect: "allow", conditions: [] },
      { capability: CAPABILITY, effect: "deny", conditions: [{ field: "effectRequest.resource", operator: "equals", value: RESOURCE_DENIED }] },
    ],
    modeCapabilities: { observe: [CAPABILITY], assist: [CAPABILITY], execute: [CAPABILITY] },
    approvalRequired: [],
    protectedPaths: [],
    maxEffectCostMicroUsd: 0,
    approvalExpirySeconds: 120,
  };
}

interface SignedReceipt {
  schemaVersion: 1;
  receiptId: string;
  runId: string;
  effectId: string;
  toolId: string;
  inputHash: string;
  outputHash: string;
  policyVersion: string;
  decisionId: string;
  issuedAt: string;
  keyId: string;
  signature?: string;
}

function canonicalReceipt(receipt: SignedReceipt): string {
  const body: Record<string, unknown> = { ...receipt };
  delete body.signature;
  return JSON.stringify(body);
}

function signReceipt(receipt: SignedReceipt, key: Uint8Array): SignedReceipt {
  return { ...receipt, signature: createHmac("sha256", key).update(canonicalReceipt(receipt)).digest("hex") };
}

function verifyReceipt(receipt: SignedReceipt, key: Uint8Array): boolean {
  const expected = createHmac("sha256", key).update(canonicalReceipt(receipt)).digest("hex");
  const presented = receipt.signature;
  if (typeof presented !== "string" || presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented, "hex"), Buffer.from(expected, "hex"));
}

function upsertBy<T>(items: T[], incoming: T, matches: (item: T) => boolean, version: (item: T) => number): T[] {
  const index = items.findIndex(matches);
  if (index < 0) items.push(incoming);
  else if (version(incoming) > version(items[index]!)) items[index] = incoming;
  return items;
}

export function createProtectedUiPorts(options: ProtectedUiPortsOptions = {}): MemoryUiPorts {
  const base = createMemoryUiPorts(options);
  const signingKey = options.signingKey ?? Buffer.from("asi-protected-effect-signing-key-dev-only");
  const effectDelayMs = options.effectDelayMs ?? 200;
  const policy = protectedEffectPolicy();

  const records = new Map<string, UiConversationRecord>();
  const workspaceOrder = new Map<string, string[]>();
  const eventLog = new Map<string, UiEvent[]>();
  const createCommands = new Map<string, string>();
  const dedupe = new Map<string, { hash: string; result: UiCommandResult }>();
  const protectedRuns = new Set<string>();
  const deniedRuns = new Set<string>();
  const managementRevision = new Map<string, number>();

  const orderFor = (workspaceId: string): string[] => {
    const existing = workspaceOrder.get(workspaceId);
    if (existing) return existing;
    const created: string[] = [];
    workspaceOrder.set(workspaceId, created);
    return created;
  };
  const owned = (workspaceId: string, conversationId: string): UiConversationRecord | undefined => {
    const record = records.get(conversationId);
    return record && record.workspaceId === workspaceId ? record : undefined;
  };
  const logFor = (conversationId: string): UiEvent[] => {
    const existing = eventLog.get(conversationId);
    if (existing) return existing;
    const created: UiEvent[] = [];
    eventLog.set(conversationId, created);
    return created;
  };

  const applyToRecord = (record: UiConversationRecord, event: UiEvent) => {
    switch (event.eventType) {
      case "message.created":
        if (!record.messages.some(message => message.messageId === event.payload.messageId)) record.messages.push(event.payload);
        break;
      case "message.delta": {
        const part = record.messages.find(message => message.messageId === event.payload.messageId)?.parts.find(item => item.partId === event.payload.partId);
        if (part && part.type === "text") part.text += event.payload.text;
        break;
      }
      case "run.status": {
        record.runStatus = event.payload.status;
        record.activeRunId = TERMINAL_RUN_STATUSES.includes(event.payload.status) ? null : event.payload.runId;
        break;
      }
      case "clarification.requested":
      case "clarification.resolved":
      case "approval.requested":
      case "approval.resolved": {
        const index = record.interactions.findIndex(item => item.interactionId === event.payload.interactionId);
        if (index < 0) record.interactions.push(event.payload);
        else record.interactions[index] = event.payload;
        record.pendingDecisionCount = record.interactions.filter(item => item.status === "pending").length;
        break;
      }
      case "task.updated":
        record.tasks = upsertBy(record.tasks, event.payload, item => item.taskId === event.payload.taskId, item => item.version);
        break;
      case "tool.updated":
        record.tools = upsertBy(record.tools, event.payload, item => item.toolId === event.payload.toolId, item => item.version);
        break;
      case "artifact.ready":
        record.artifacts = upsertBy(record.artifacts, event.payload, item => item.artifactId === event.payload.artifactId, item => item.version);
        break;
      case "verification.completed": {
        const list = record.verifications ?? (record.verifications = []);
        record.verifications = upsertBy(list, event.payload, item => item.reportId === event.payload.reportId, item => item.goalRevision);
        break;
      }
      default:
        break;
    }
  };

  const emit = (record: UiConversationRecord, eventType: UiEventType, payload: unknown): UiEvent => {
    record.lastEventSequence += 1;
    record.lastUpdatedAt = nowIso();
    const event = UiEventSchema.parse({ schemaVersion: 1, eventId: newId("event"), conversationId: record.conversationId, sequence: record.lastEventSequence, occurredAt: record.lastUpdatedAt, eventType, payload });
    logFor(record.conversationId).push(event);
    applyToRecord(record, event);
    return event;
  };

  const applied = (commandId: string, revision: number): UiCommandResult => ({ status: "applied", commandId, revision });
  const conflict = (commandId: string, revision: number): UiCommandResult => ({ status: "conflict", commandId, revision, error: normalizedError("STALE_WRITER", "The conversation changed since it was loaded.") });
  const rejected = (commandId: string, revision: number, message: string, code: "POLICY_DENIED" | "INVALID_INPUT" | "UNKNOWN_OUTCOME" = "POLICY_DENIED"): UiCommandResult => ({ status: "rejected", commandId, revision, error: normalizedError(code, message) });
  const once = (key: string, input: object, revision: number, operation: () => UiCommandResult): UiCommandResult => {
    const commandKey = `${key}/${"commandId" in input ? String((input as { commandId: unknown }).commandId) : ""}`;
    const hash = sha256(JSON.stringify(input));
    const previous = dedupe.get(commandKey);
    if (previous) return previous.hash === hash ? previous.result : conflict((input as { commandId: string }).commandId, revision);
    const result = operation();
    dedupe.set(commandKey, { hash, result });
    return result;
  };

  const newRecord = (workspaceId: string, title: string): UiConversationRecord => {
    const record: UiConversationRecord = {
      conversationId: newId("conversation"),
      workspaceId,
      title,
      lastUpdatedAt: nowIso(),
      revision: 0,
      lastEventSequence: 0,
      pendingDecisionCount: 0,
      runStatus: null,
      activeRunId: null,
      effectiveModel: "gateway-protected-runtime",
      messages: [],
      interactions: [],
      tasks: [],
      tools: [],
      artifacts: [],
      usage: { inputTokens: null, outputTokens: null, costMicroUsd: null },
      composerCapabilities: ["send", "cancel"],
    };
    records.set(record.conversationId, record);
    orderFor(workspaceId).push(record.conversationId);
    return record;
  };

  const requestClarification = (record: UiConversationRecord, runId: string) => {
    const value: ClarificationRequest = {
      type: "clarification",
      interactionId: newId("interaction"),
      conversationId: record.conversationId,
      runId,
      version: 1,
      questionId: newId("question"),
      status: "pending",
      prompt: "How detailed should the protected answer be?",
      options: [{ optionId: "concise", label: "Concise" }, { optionId: "detailed", label: "Detailed" }],
      allowFreeText: true,
      allowMultiple: false,
      required: true,
    };
    emit(record, "clarification.requested", value);
    emit(record, "run.status", { runId, status: "suspended", suspendReason: "user_input" });
    return value;
  };

  const requestApproval = (record: UiConversationRecord, runId: string, expired = false) => {
    const denied = deniedRuns.has(runId);
    const value: UiApprovalRequest = {
      type: "approval",
      interactionId: newId("interaction"),
      conversationId: record.conversationId,
      runId,
      version: 1,
      approvalId: newId("approval"),
      effectId: newId("effect"),
      status: "pending",
      action: denied ? "Denied protected action" : "Read a protected workspace document",
      target: denied ? RESOURCE_DENIED : RESOURCE_READ,
      preview: "Approved effects are authorized by the policy kernel and recorded as a signed receipt; qualified executable isolation stays disabled on Windows.",
      expiresAt: expired ? "2020-01-01T00:00:00.000Z" : new Date(Date.now() + 600_000).toISOString(),
      requiredActorRole: "user",
      actionRef: newId("action"),
    };
    emit(record, "approval.requested", value);
    emit(record, "run.status", { runId, status: "waiting_approval" });
    return value;
  };

  const policyPrincipal = (workspaceId: string): Principal => ({
    tenantId: workspaceId,
    subjectId: `subject-${workspaceId}`,
    roles: ["user"],
    capabilities: [CAPABILITY],
    audience: "policy-kernel",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    authenticatedSource: "gateway-browser-session",
  });

  const runStatus = (record: UiConversationRecord): RunStatus | null => record.runStatus;

  const executeApproved = (record: UiConversationRecord, approval: UiApprovalRequest) => {
    if (record.activeRunId !== approval.runId || record.runStatus !== "queued") return;
    const runId = approval.runId;
    const denied = deniedRuns.has(runId);
    emit(record, "run.status", { runId, status: "running" });

    const resource = denied ? RESOURCE_DENIED : RESOURCE_READ;
    const inputHash = sha256(`${record.conversationId}:${runId}:${resource}`);
    const request: EffectRequest = {
      schemaVersion: 1,
      effectId: approval.effectId,
      action: denied ? ACTION_DENIED : ACTION_READ,
      resource,
      inputHash,
      runContext: {
        runId,
        sessionId: `session-${record.conversationId}`,
        writerEpoch: 1,
        mode: "execute",
        deadlineAt: new Date(Date.now() + 300_000).toISOString(),
        budgetRef: { tenantId: record.workspaceId, accountId: "account-local", rootRunId: runId },
      },
      idempotencyKey: `idem-${runId}`,
      traceId: `trace-${runId}`,
      requiredCapabilities: [CAPABILITY],
    };

    let decision: PolicyDecision;
    try {
      decision = evaluatePolicy(policy, EffectRequestSchema.parse(request), policyPrincipal(record.workspaceId));
    } catch {
      emit(record, "error", normalizedError("DEPENDENCY_UNAVAILABLE", "The policy kernel could not evaluate the protected effect.", true));
      emit(record, "run.status", { runId, status: "failed" });
      return;
    }

    if (decision.decision !== "allow") {
      emit(record, "error", normalizedError("POLICY_DENIED", "The policy kernel denied the protected effect."));
      emit(record, "run.status", { runId, status: "failed" });
      return;
    }

    const toolId = newId("tool");
    const artifactId = newId("artifact");
    emit(record, "tool.updated", { toolId, conversationId: record.conversationId, runId, version: 1, status: "executing", summary: "Authorized read-only protected effect executing under policy", allowedActions: [], evidenceRefs: [] });
    emit(record, "task.updated", { taskId: newId("task"), conversationId: record.conversationId, runId, version: 1, status: "running", summary: "Applying the approved protected effect", allowedActions: [], evidenceRefs: [] });

    const receipt = signReceipt({ schemaVersion: 1, receiptId: newId("receipt"), runId, effectId: approval.effectId, toolId, inputHash, outputHash: sha256(`${approval.effectId}:${decision.decisionId}`), policyVersion: decision.policyVersion, decisionId: decision.decisionId, issuedAt: nowIso(), keyId: RECEIPT_KEY_ID }, signingKey);
    const verified = typeof receipt.signature === "string" && verifyReceipt(receipt, signingKey);

    emit(record, "artifact.ready", { artifactId, conversationId: record.conversationId, runId, version: 1, title: "Protected action receipt", mediaType: "text/plain", contentRef: receipt.receiptId, allowedActions: ["view"], preview: `Signed receipt ${receipt.receiptId} (key ${receipt.keyId}) for ${resource}.` });
    emit(record, "tool.updated", { toolId, conversationId: record.conversationId, runId, version: 2, status: "succeeded", summary: "Protected effect authorized and completed; receipt issued", allowedActions: [], evidenceRefs: [artifactId] });
    emit(record, "verification.completed", { conversationId: record.conversationId, revision: record.revision, allowedActions: [], reportId: newId("report"), goalId: `goal-${runId}`, runId, goalRevision: 1, status: verified ? "verified" : "unmet", criterionResults: [{ criterionId: "receipt-integrity", satisfied: verified, evidenceRefs: [artifactId], safeReason: verified ? "The signed receipt signature and digest verify." : "Receipt signature verification failed." }], checkedAt: nowIso(), limitations: ["Effect is a governed in-process read; qualified executable tool isolation is not available on Windows."] });
    emit(record, "task.updated", { taskId: newId("task"), conversationId: record.conversationId, runId, version: 2, status: "completed", summary: "Protected effect completed after approval", allowedActions: [], evidenceRefs: [artifactId] });
    emit(record, "run.status", { runId, status: "completed" });
  };

  const findRecordByInteraction = (workspaceId: string, interactionId: string, type: Interaction["type"]): UiConversationRecord | undefined =>
    [...records.values()].find(candidate => candidate.workspaceId === workspaceId && candidate.interactions.some(item => item.type === type && (item.interactionId === interactionId || (item.type === "clarification" ? item.questionId : item.approvalId) === interactionId)));

  const control: UiControlPort = {
    async list(workspaceId, cursor) {
      const summaries = orderFor(workspaceId).map(conversationId => records.get(conversationId)).filter((record): record is UiConversationRecord => record !== undefined).map(projectSummary);
      const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const page: Page<ConversationSummary> = { items: summaries.slice(offset, offset + 50), nextCursor: offset + 50 < summaries.length ? String(offset + 50) : null };
      return page;
    },
    async create(workspaceId, commandId) {
      const key = `${workspaceId}:${commandId}`;
      const existing = createCommands.get(key);
      if (existing) {
        const record = records.get(existing);
        if (record) return projectSummary(record);
      }
      const record = newRecord(workspaceId, "New conversation");
      createCommands.set(key, record.conversationId);
      emit(record, "conversation.updated", projectSummary(record));
      return projectSummary(record);
    },
    async read(workspaceId, conversationId) {
      return owned(workspaceId, conversationId) ?? null;
    },
    async patch(workspaceId, conversationId, patch: ConversationPatch) {
      const record = owned(workspaceId, conversationId);
      if (!record) return rejected(patch.commandId, 0, "Conversation unavailable.");
      if (patch.expectedRevision !== record.revision) return conflict(patch.commandId, record.revision);
      if ("title" in patch) record.title = patch.title;
      else return rejected(patch.commandId, record.revision, "Conversation archival is unavailable.");
      record.revision += 1;
      emit(record, "conversation.updated", projectSummary(record));
      return applied(patch.commandId, record.revision);
    },
    async appendMessage(workspaceId, conversationId, input: SendMessageInput) {
      const record = owned(workspaceId, conversationId);
      if (!record) return rejected(input.commandId, 0, "Conversation unavailable.");
      return once(`send/${conversationId}`, input, record.revision, () => {
        if (input.expectedConversationRevision !== record.revision) return conflict(input.commandId, record.revision);
        if (input.attachmentIds.length > 3) return rejected(input.commandId, record.revision, "Attachment is not authorized or ready for run input.");
        if (record.runStatus && !TERMINAL_RUN_STATUSES.includes(record.runStatus)) return rejected(input.commandId, record.revision, "Finish or cancel the current run first.");
        if (record.messages.some(message => message.messageId === input.clientMessageId)) return conflict(input.commandId, record.revision);
        const runId = newId("run");
        const isProtected = input.text === "/protected" || input.text === "/denied";
        if (isProtected) protectedRuns.add(runId);
        if (input.text === "/denied") deniedRuns.add(runId);
        emit(record, "message.created", { messageId: input.clientMessageId, role: "user", createdAt: nowIso(), parts: [{ type: "text", partId: newId("part"), text: input.text }] } satisfies UiMessage);
        emit(record, "run.status", { runId, status: "running" });
        if (isProtected) {
          const messageId = newId("assistant");
          const partId = newId("part");
          emit(record, "message.created", { messageId, role: "assistant", createdAt: nowIso(), parts: [{ type: "text", partId, text: "" }] } satisfies UiMessage);
          ["Preparing the protected action. ", "No model or tool effect runs until you approve it."].forEach((text, deltaIndex) => emit(record, "message.delta", { messageId, partId, deltaIndex, text }));
          emit(record, "message.completed", { messageId });
          requestClarification(record, runId);
        } else if (input.text === "/expired") {
          requestApproval(record, runId, true);
        } else if (input.text === "/error" || input.text === "/unknown" || input.text === "/budget") {
          if (input.text !== "/budget") emit(record, "tool.updated", { toolId: newId("tool"), conversationId, runId, version: 1, status: input.text === "/unknown" ? "unknown" : "failed", summary: "Tool outcome is unknown; no effect is assumed", allowedActions: [], evidenceRefs: [] });
          emit(record, "error", normalizedError(input.text === "/budget" ? "BUDGET_EXCEEDED" : input.text === "/unknown" ? "UNKNOWN_OUTCOME" : "DEPENDENCY_UNAVAILABLE", "The run failed before any protected effect."));
          emit(record, "run.status", { runId, status: input.text === "/budget" ? "budget_exhausted" : "failed" });
        } else {
          const messageId = newId("assistant");
          const partId = newId("part");
          emit(record, "message.created", { messageId, role: "assistant", createdAt: nowIso(), parts: [{ type: "text", partId, text: "" }] } satisfies UiMessage);
          ["Request accepted by the Gateway. ", "No model or tool was invoked."].forEach((text, deltaIndex) => emit(record, "message.delta", { messageId, partId, deltaIndex, text }));
          emit(record, "message.completed", { messageId });
          emit(record, "run.status", { runId, status: "completed" });
        }
        record.revision += 1;
        return applied(input.commandId, record.revision);
      });
    },
    async cancelRun(workspaceId, runId, commandId) {
      const record = [...records.values()].find(candidate => candidate.workspaceId === workspaceId && candidate.activeRunId === runId);
      if (!record) return conflict(commandId, 0);
      return once(`cancel/${runId}`, { commandId }, record.revision, () => {
        if (!runStatus(record) || TERMINAL_RUN_STATUSES.includes(runStatus(record)!)) return conflict(commandId, record.revision);
        for (const item of record.interactions.filter(candidate => candidate.runId === runId && candidate.status === "pending")) {
          emit(record, item.type === "approval" ? "approval.resolved" : "clarification.resolved", { ...item, version: item.version + 1, status: "cancelled" });
        }
        emit(record, "run.status", { runId, status: "cancelled" });
        record.revision += 1;
        return applied(commandId, record.revision);
      });
    },
    async answerClarification(workspaceId, interactionId, input: ClarificationAnswer) {
      const record = findRecordByInteraction(workspaceId, interactionId, "clarification");
      if (!record) return rejected(input.commandId, 0, "Clarification unavailable.");
      return once(`answer/${interactionId}`, input, record.revision, () => {
        const item = record.interactions.find((candidate): candidate is ClarificationRequest => candidate.type === "clarification" && (candidate.interactionId === interactionId || candidate.questionId === interactionId));
        if (!item) return rejected(input.commandId, record.revision, "Clarification unavailable.");
        if (item.version !== input.expectedVersion || item.status !== "pending" || record.activeRunId !== item.runId || record.runStatus !== "suspended") return conflict(input.commandId, record.revision);
        if (new Set(input.optionIds).size !== input.optionIds.length || input.optionIds.some(optionId => !item.options.some(option => option.optionId === optionId)) || (!item.allowMultiple && input.optionIds.length > 1) || (!item.allowFreeText && input.text)) return rejected(input.commandId, record.revision, "Answer does not match the question options.");
        emit(record, "clarification.resolved", { ...item, version: item.version + 1, status: "answered" });
        if (protectedRuns.has(item.runId)) requestApproval(record, item.runId);
        else emit(record, "run.status", { runId: item.runId, status: "completed" });
        record.revision += 1;
        return applied(input.commandId, record.revision);
      });
    },
    async decideApproval(workspaceId, interactionId, input: ApprovalDecisionInput) {
      const record = findRecordByInteraction(workspaceId, interactionId, "approval");
      if (!record) return rejected(input.commandId, 0, "Approval unavailable.");
      return once(`decision/${interactionId}`, input, record.revision, () => {
        const item = record.interactions.find((candidate): candidate is UiApprovalRequest => candidate.type === "approval" && (candidate.interactionId === interactionId || candidate.approvalId === interactionId));
        if (!item) return rejected(input.commandId, record.revision, "Approval unavailable.");
        if (item.version !== input.expectedVersion || item.status !== "pending" || record.activeRunId !== item.runId || record.runStatus !== "waiting_approval") return conflict(input.commandId, record.revision);
        if (Date.parse(item.expiresAt) <= Date.now()) {
          emit(record, "approval.resolved", { ...item, version: item.version + 1, status: "expired" });
          record.revision += 1;
          return rejected(input.commandId, record.revision, "The proposal expired before it was decided.");
        }
        emit(record, "approval.resolved", { ...item, version: item.version + 1, status: input.decision === "approve" ? "approved" : "rejected" });
        emit(record, "run.status", { runId: item.runId, status: input.decision === "approve" ? "queued" : "cancelled" });
        if (input.decision === "approve") {
          const timer = setTimeout(() => executeApproved(record, item), effectDelayMs);
          timer.unref?.();
        }
        record.revision += 1;
        return applied(input.commandId, record.revision);
      });
    },
    async submitCommand(workspaceId, command: UiMutationCommand) {
      const key = `${workspaceId}:${command.commandId}`;
      const prior = dedupe.get(key);
      if (prior) return prior.result;
      const currentRevision = managementRevision.get(workspaceId) ?? 0;
      let result: UiCommandResult;
      if (isGatedCommand(command)) {
        const record = newRecord(workspaceId, "Management request");
        const runId = newId("run");
        emit(record, "conversation.updated", projectSummary(record));
        const approval: UiApprovalRequest = { type: "approval", interactionId: newId("interaction"), conversationId: record.conversationId, runId, version: 1, approvalId: newId("approval"), effectId: newId("effect"), status: "pending", action: command.type, target: workspaceId, preview: JSON.stringify(redactCommand(command)), expiresAt: new Date(Date.now() + 60_000).toISOString(), requiredActorRole: "workspace-admin", actionRef: newId("action") };
        emit(record, "approval.requested", approval);
        emit(record, "run.status", { runId, status: "waiting_approval" });
        managementRevision.set(workspaceId, 1);
        result = { status: "approval_required", commandId: command.commandId, revision: 1, conversationId: record.conversationId, interactionId: approval.interactionId };
      } else if (command.expectedRevision !== currentRevision) {
        result = conflict(command.commandId, currentRevision);
      } else {
        const next = currentRevision + 1;
        managementRevision.set(workspaceId, next);
        result = applied(command.commandId, next);
      }
      dedupe.set(key, { hash: sha256(JSON.stringify(command)), result });
      return result;
    },
  };

  const episodes: UiEpisodePort = {
    async readEvents(_workspaceId, conversationId, after) {
      return logFor(conversationId).filter(event => event.sequence > after);
    },
  };

  const auth = {
    async verifyAssertion(assertion: string): Promise<UiPrincipal | null> {
      const workspaceId = assertion === "assert-workspace-a" ? "workspace-a" : assertion === "assert-workspace-b" ? "workspace-b" : null;
      if (!workspaceId) return null;
      return { subjectId: `subject-${workspaceId}`, workspaceId, displayName: workspaceId === "workspace-a" ? "Workspace A" : "Workspace B", allowedActions: WORKSPACE_ACTIONS[workspaceId] ?? [] };
    },
  };
  const authorization = {
    async allowedActions(workspaceId: string): Promise<string[]> {
      return WORKSPACE_ACTIONS[workspaceId] ?? [];
    },
  };

  return { ...base, control, episodes, auth, authorization };
}
