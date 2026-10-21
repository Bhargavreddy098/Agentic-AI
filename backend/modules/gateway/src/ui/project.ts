import { UiEventTypeSchema, type ConversationSnapshot, type ConversationSummary, type WorkspaceSession } from "@asi/contracts";
import type { UiConversationRecord, UiPrincipal, UiUploadLimits } from "./ports.js";

const SUPPORTED_EVENTS = UiEventTypeSchema.options;

export function projectSession(principal: UiPrincipal, csrfToken: string, limits: UiUploadLimits): WorkspaceSession {
  return {
    workspaceId: principal.workspaceId,
    displayName: principal.displayName,
    subjectId: principal.subjectId,
    allowedActions: principal.allowedActions,
    demoMode: false,
    csrfToken,
    limits: {
      maxMessageBytes: limits.maxMessageBytes,
      maxAttachmentBytes: limits.maxAttachmentBytes,
      maxAttachmentCount: limits.maxAttachmentCount,
    },
    supportedEvents: [...SUPPORTED_EVENTS],
  };
}

export function projectSummary(record: UiConversationRecord): ConversationSummary {
  return {
    conversationId: record.conversationId,
    workspaceId: record.workspaceId,
    title: record.title,
    lastUpdatedAt: record.lastUpdatedAt,
    pendingDecisionCount: record.pendingDecisionCount,
    activeRun: record.runStatus,
    revision: record.revision,
  };
}

export function projectSnapshot(record: UiConversationRecord): ConversationSnapshot {
  return {
    conversationId: record.conversationId,
    workspaceId: record.workspaceId,
    revision: record.revision,
    lastEventSequence: record.lastEventSequence,
    messages: record.messages,
    interactions: record.interactions,
    tasks: record.tasks,
    tools: record.tools,
    artifacts: record.artifacts,
    ...(record.goals ? { goals: record.goals } : {}),
    ...(record.plans ? { plans: record.plans } : {}),
    ...(record.verifications ? { verifications: record.verifications } : {}),
    ...(record.projects ? { projects: record.projects } : {}),
    runStatus: record.runStatus,
    activeRunId: record.activeRunId,
    effectiveModel: record.effectiveModel,
    usage: record.usage,
    composerCapabilities: record.composerCapabilities,
  };
}
