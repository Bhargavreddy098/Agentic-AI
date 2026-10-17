import { randomUUID } from "node:crypto";
import {
  type ApprovalDecisionInput,
  type ClarificationAnswer,
  type ConversationPatch,
  type ConversationSummary,
  type Page,
  type SendMessageInput,
  type UiApprovalRequest,
  type UiCommandResult,
  type UiEvent,
  type UiMessage,
  type UiMutationCommand,
} from "@asi/contracts";
import { normalizedError } from "./errors.js";
import { projectSummary } from "./project.js";
import { isGatedCommand, redactCommand } from "./commands/management.js";
import type {
  UiAuthPort,
  UiAuthorizationPort,
  UiCatalogPorts,
  UiControlPort,
  UiConversationRecord,
  UiEpisodePort,
  UiPrincipal,
  UiUploadPort,
} from "./ports.js";

export interface MemoryUiPortOptions {
  scanAvailable?: boolean;
}

export interface MemoryUiPorts {
  control: UiControlPort;
  episodes: UiEpisodePort;
  uploads: UiUploadPort;
  auth: UiAuthPort;
  authorization: UiAuthorizationPort;
  catalogs: UiCatalogPorts;
  setScanAvailable(value: boolean): void;
}

const nowIso = () => new Date().toISOString();

export function createMemoryUiPorts(options: MemoryUiPortOptions = {}): MemoryUiPorts {
  const workspaceActions = new Map<string, string[]>([
    ["workspace-a", ["conversation.create", "message.send", "upload.write", "catalog.read", "catalog.manage"]],
    ["workspace-b", ["conversation.create", "message.send", "upload.write", "catalog.read"]],
  ]);
  const principals = new Map<string, UiPrincipal>([
    ["assert-workspace-a", { subjectId: "subject-workspace-a", workspaceId: "workspace-a", displayName: "Workspace A", allowedActions: workspaceActions.get("workspace-a") ?? [] }],
    ["assert-workspace-b", { subjectId: "subject-workspace-b", workspaceId: "workspace-b", displayName: "Workspace B", allowedActions: workspaceActions.get("workspace-b") ?? [] }],
  ]);
  const records = new Map<string, UiConversationRecord>();
  const workspaceOrder = new Map<string, string[]>();
  const eventLog = new Map<string, UiEvent[]>();
  const createCommands = new Map<string, string>();
  const uploads = new Map<string, { workspaceId: string; status: "ready" | "rejected"; attachmentId?: string }>();
  const managementCommands = new Map<string, UiCommandResult>();
  const managementRevision = new Map<string, number>();
  let scanAvailable = options.scanAvailable ?? true;

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
  const envelope = (record: UiConversationRecord) => {
    record.lastEventSequence += 1;
    record.lastUpdatedAt = nowIso();
    return { schemaVersion: 1 as const, eventId: randomUUID(), conversationId: record.conversationId, sequence: record.lastEventSequence, occurredAt: record.lastUpdatedAt };
  };
  const emit = (record: UiConversationRecord, event: UiEvent) => {
    logFor(record.conversationId).push(event);
    return event;
  };
  const applied = (commandId: string, revision: number): UiCommandResult => ({ status: "applied", commandId, revision });
  const conflict = (commandId: string, revision: number): UiCommandResult => ({ status: "conflict", commandId, revision, error: normalizedError("STALE_WRITER", "The conversation changed since it was loaded.") });
  const rejected = (commandId: string, revision: number, message: string): UiCommandResult => ({ status: "rejected", commandId, revision, error: normalizedError("POLICY_DENIED", message) });

  const newRecord = (workspaceId: string, title: string): UiConversationRecord => {
    const record: UiConversationRecord = {
      conversationId: randomUUID(),
      workspaceId,
      title,
      lastUpdatedAt: nowIso(),
      revision: 0,
      lastEventSequence: 0,
      pendingDecisionCount: 0,
      runStatus: null,
      activeRunId: null,
      effectiveModel: null,
      messages: [],
      interactions: [],
      tasks: [],
      tools: [],
      artifacts: [],
      usage: { inputTokens: null, outputTokens: null, costMicroUsd: null },
      composerCapabilities: ["message.send"],
    };
    records.set(record.conversationId, record);
    orderFor(workspaceId).push(record.conversationId);
    return record;
  };

  const control: UiControlPort = {
    async list(workspaceId, cursor) {
      const summaries = orderFor(workspaceId).map(conversationId => records.get(conversationId)).filter((record): record is UiConversationRecord => record !== undefined).map(projectSummary);
      const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const items = summaries.slice(offset, offset + 50);
      const nextCursor = offset + 50 < summaries.length ? String(offset + 50) : null;
      const page: Page<ConversationSummary> = { items, nextCursor };
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
      emit(record, { ...envelope(record), eventType: "conversation.updated", payload: projectSummary(record) } as UiEvent);
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
      emit(record, { ...envelope(record), eventType: "conversation.updated", payload: projectSummary(record) } as UiEvent);
      return applied(patch.commandId, record.revision);
    },
    async appendMessage(workspaceId, conversationId, input: SendMessageInput) {
      const record = owned(workspaceId, conversationId);
      if (!record) return rejected(input.commandId, 0, "Conversation unavailable.");
      if (input.expectedConversationRevision !== record.revision) return conflict(input.commandId, record.revision);
      const userMessage: UiMessage = { messageId: input.clientMessageId, role: "user", createdAt: nowIso(), parts: [{ type: "text", partId: randomUUID(), text: input.text }] };
      record.messages.push(userMessage);
      emit(record, { ...envelope(record), eventType: "message.created", payload: userMessage } as UiEvent);
      const assistantMessage: UiMessage = { messageId: randomUUID(), role: "assistant", createdAt: nowIso(), parts: [{ type: "status-summary", partId: randomUUID(), summary: "Request accepted." }] };
      record.messages.push(assistantMessage);
      emit(record, { ...envelope(record), eventType: "message.created", payload: assistantMessage } as UiEvent);
      const runId = `run-${randomUUID()}`;
      emit(record, { ...envelope(record), eventType: "run.status", payload: { runId, status: "running" } } as UiEvent);
      record.runStatus = "completed";
      emit(record, { ...envelope(record), eventType: "run.status", payload: { runId, status: "completed" } } as UiEvent);
      record.revision += 1;
      return applied(input.commandId, record.revision);
    },
    async cancelRun(workspaceId, runId, commandId) {
      const record = [...records.values()].find(candidate => candidate.workspaceId === workspaceId && candidate.activeRunId === runId);
      if (!record) return conflict(commandId, 0);
      record.runStatus = "cancelled";
      record.activeRunId = null;
      emit(record, { ...envelope(record), eventType: "run.status", payload: { runId, status: "cancelled" } } as UiEvent);
      record.revision += 1;
      return applied(commandId, record.revision);
    },
    async answerClarification(workspaceId, interactionId, input: ClarificationAnswer) {
      const record = [...records.values()].find(candidate => candidate.workspaceId === workspaceId && candidate.interactions.some(interaction => interaction.interactionId === interactionId && interaction.type === "clarification"));
      if (!record) return rejected(input.commandId, 0, "Clarification unavailable.");
      return conflict(input.commandId, record.revision);
    },
    async decideApproval(workspaceId, interactionId, input: ApprovalDecisionInput) {
      const record = [...records.values()].find(candidate => candidate.workspaceId === workspaceId && candidate.interactions.some(interaction => interaction.interactionId === interactionId && interaction.type === "approval"));
      if (!record) return rejected(input.commandId, 0, "Approval unavailable.");
      const approval = record.interactions.find((interaction): interaction is UiApprovalRequest => interaction.interactionId === interactionId && interaction.type === "approval");
      if (!approval) return rejected(input.commandId, 0, "Approval unavailable.");
      if (input.expectedVersion !== approval.version) return conflict(input.commandId, approval.version);
      approval.status = input.decision === "approve" ? "approved" : "rejected";
      record.pendingDecisionCount = 0;
      record.runStatus = input.decision === "approve" ? "queued" : "cancelled";
      record.activeRunId = input.decision === "approve" ? approval.runId : null;
      emit(record, { ...envelope(record), eventType: "approval.resolved", payload: approval } as UiEvent);
      record.revision += 1;
      return applied(input.commandId, record.revision);
    },
    async submitCommand(workspaceId, command: UiMutationCommand) {
      const key = `${workspaceId}:${command.commandId}`;
      const prior = managementCommands.get(key);
      if (prior) return prior;
      const currentRevision = managementRevision.get(workspaceId) ?? 0;
      let result: UiCommandResult;
      if (isGatedCommand(command)) {
        const record = newRecord(workspaceId, "Management request");
        const runId = `run-${randomUUID()}`;
        const interactionId = `interaction-${randomUUID()}`;
        const approval: UiApprovalRequest = {
          type: "approval",
          interactionId,
          conversationId: record.conversationId,
          runId,
          version: 1,
          approvalId: `approval-${randomUUID()}`,
          effectId: `effect-${randomUUID()}`,
          status: "pending",
          action: command.type,
          target: workspaceId,
          preview: JSON.stringify(redactCommand(command)),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          requiredActorRole: "workspace-admin",
          actionRef: `action-${randomUUID()}`,
        };
        record.interactions.push(approval);
        record.pendingDecisionCount = 1;
        record.runStatus = "waiting_approval";
        record.activeRunId = runId;
        emit(record, { ...envelope(record), eventType: "conversation.updated", payload: projectSummary(record) } as UiEvent);
        emit(record, { ...envelope(record), eventType: "approval.requested", payload: approval } as UiEvent);
        managementRevision.set(workspaceId, 1);
        result = { status: "approval_required", commandId: command.commandId, revision: 1, conversationId: record.conversationId, interactionId };
      } else if (command.expectedRevision !== currentRevision) {
        result = { status: "conflict", commandId: command.commandId, revision: currentRevision, error: normalizedError("STALE_WRITER", "Configuration changed since it was loaded.") };
      } else {
        const next = currentRevision + 1;
        managementRevision.set(workspaceId, next);
        result = { status: "applied", commandId: command.commandId, revision: next };
      }
      managementCommands.set(key, result);
      return result;
    },
  };

  const episodes: UiEpisodePort = {
    async readEvents(_workspaceId, conversationId, after) {
      return logFor(conversationId).filter(event => event.sequence > after);
    },
  };

  const uploadPort: UiUploadPort = {
    async scan(input) {
      if (!scanAvailable) return { status: "unavailable", reason: "Upload authorization service is unavailable." };
      if (input.mimeType === "application/javascript" || input.byteSize > 16_777_216) return { status: "rejected", reason: "Upload rejected by policy." };
      uploads.set(input.uploadId, { workspaceId: input.workspaceId, status: "ready", attachmentId: `attachment-${input.uploadId}` });
      return { status: "ready", attachmentId: `attachment-${input.uploadId}` };
    },
    async discard(_workspaceId, uploadId) {
      uploads.get(uploadId);
    },
  };

  const auth: UiAuthPort = {
    async verifyAssertion(assertion) {
      return principals.get(assertion) ?? null;
    },
  };

  const authorization: UiAuthorizationPort = {
    async allowedActions(workspaceId) {
      return workspaceActions.get(workspaceId) ?? [];
    },
  };

  return {
    control,
    episodes,
    uploads: uploadPort,
    auth,
    authorization,
    catalogs: {},
    setScanAvailable(value: boolean) {
      scanAvailable = value;
    },
  };
}
