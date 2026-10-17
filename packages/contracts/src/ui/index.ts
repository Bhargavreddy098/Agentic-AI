import { z } from "zod";
import { OpaqueIdSchema as Id, UtcTimestampSchema as Timestamp, MicroUsdSchema } from "../primitives.js";
import { RunStatusSchema, NormalizedErrorSchema } from "../task.js";
const Revision = z.number().int().nonnegative();
const Version = z.number().int().positive();
const Summary = z.string().max(4096);
const Actions = z.array(Id).max(128);
const Availability = z.enum(["ready", "unavailable", "permission_denied"]);
const command = { commandId: Id, expectedRevision: Revision };

export const SendMessageInputSchema = z.strictObject({ commandId: Id, clientMessageId: Id, text: z.string().max(1048576), attachmentIds: z.array(Id).max(16), requestedModelId: Id.optional(), requestedSkillIds: z.array(Id).max(32), expectedConversationRevision: Revision }).refine(input => input.text.trim().length > 0 || input.attachmentIds.length > 0, "message content required");
export const ClarificationAnswerSchema = z.strictObject({ commandId: Id, expectedVersion: Version, optionIds: z.array(Id).max(32), text: Summary.optional() }).refine(input => input.optionIds.length > 0 || Boolean(input.text?.trim()), "answer required");
export const ApprovalDecisionInputSchema = z.strictObject({ commandId: Id, expectedVersion: Version, decision: z.enum(["approve", "reject"]) });
export const ConversationPatchSchema = z.union([z.strictObject({ ...command, title: z.string().min(1).max(256) }), z.strictObject({ ...command, archived: z.boolean() })]);
export const UploadIntentSchema = z.strictObject({ commandId: Id, fileName: z.string().min(1).max(255), mimeType: z.string().min(1).max(128), byteSize: Revision.max(16777216) });
export const UploadViewSchema = z.strictObject({ uploadId: Id, attachmentId: Id.optional(), status: z.enum(["pending", "uploading", "scanning", "ready", "rejected"]), reason: Summary.optional() });
export const MemorySearchInputSchema = z.strictObject({ query: Summary, scope: z.enum(["Global", "Role", "Private"]).optional(), cursor: Id.optional(), limit: z.number().int().min(1).max(100) });
export const ActivityQuerySchema = z.strictObject({ status: Id.optional(), conversationId: Id.optional(), cursor: Id.optional(), limit: z.number().int().min(1).max(100) });
const mutation = <T extends string, F extends z.ZodRawShape>(type: T, fields: F) => z.strictObject({ ...command, type: z.literal(type), ...fields });
export const UiMutationCommandSchema = z.discriminatedUnion("type", [
  mutation("provider.connect", { providerId: Id, credential: z.string().min(1).max(8192) }), mutation("provider.disconnect", { providerId: Id }),
  mutation("model.preference.set", { modelId: Id }), mutation("skill.install", { skillId: Id, skillVersion: Id }),
  mutation("skill.enable", { skillId: Id }), mutation("skill.disable", { skillId: Id }), mutation("skill.revoke", { skillId: Id }),
  mutation("connection.connect", { connectionId: Id }), mutation("connection.disconnect", { connectionId: Id }),
  mutation("memory.correct", { memoryId: Id, value: Summary }), mutation("memory.delete", { memoryId: Id }),
  mutation("settings.update", { changes: z.strictObject({ notifications: z.boolean().optional(), scheduleEnabled: z.boolean().optional(), privacyMode: z.enum(["local_only", "redacted_cloud"]).optional(), spendLimitMicroUsd: MicroUsdSchema.optional(), retentionDays: Revision.optional() }).refine(value => Object.keys(value).length > 0, "change required") }),
]);
const result = { commandId: Id, revision: Revision };
export const UiCommandResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ ...result, status: z.literal("applied") }),
  z.strictObject({ ...result, status: z.literal("approval_required"), conversationId: Id, interactionId: Id }),
  z.strictObject({ ...result, status: z.literal("rejected"), error: NormalizedErrorSchema }),
  z.strictObject({ ...result, status: z.literal("conflict"), error: NormalizedErrorSchema }),
]);

const interaction = { interactionId: Id, conversationId: Id, runId: Id, version: Version };
export const ClarificationRequestSchema = z.strictObject({ ...interaction, type: z.literal("clarification"), questionId: Id, status: z.enum(["pending", "answered", "expired", "cancelled"]), prompt: Summary, options: z.array(z.strictObject({ optionId: Id, label: z.string().min(1).max(256) })).max(32), allowFreeText: z.boolean(), allowMultiple: z.boolean(), required: z.boolean(), expiresAt: Timestamp.optional() });
export const UiApprovalRequestSchema = z.strictObject({ ...interaction, type: z.literal("approval"), approvalId: Id, effectId: Id, status: z.enum(["pending", "approved", "rejected", "expired", "cancelled"]), action: Summary, target: Summary, preview: Summary, expiresAt: Timestamp, requiredActorRole: Id, actionRef: Id });
export const InteractionSchema = z.discriminatedUnion("type", [ClarificationRequestSchema, UiApprovalRequestSchema]);

const view = { revision: Revision, allowedActions: Actions };
export const ProviderViewSchema = z.strictObject({ ...view, providerId: Id, displayName: Summary, status: z.enum(["connected", "disconnected", "unavailable", "blocked"]), credentialLabel: Summary.optional() });
export const ModelViewSchema = z.strictObject({ ...view, modelId: Id, providerId: Id, displayName: Summary, locality: z.enum(["local", "cloud"]), status: z.enum(["available", "unavailable", "blocked"]), preferred: z.boolean() });
export const SkillViewSchema = z.strictObject({ ...view, skillId: Id, displayName: Summary, description: Summary, skillVersion: Id, status: z.enum(["enabled", "disabled", "unavailable"]), trustStatus: z.enum(["verified", "pending", "revoked"]), requiredPermissions: Actions });
export const ConnectionViewSchema = z.strictObject({ ...view, connectionId: Id, displayName: Summary, kind: z.enum(["tool", "mcp", "a2a", "messaging"]), status: z.enum(["connected", "disconnected", "unavailable", "blocked"]), permissions: Actions });
export const MemoryViewSchema = z.strictObject({ ...view, memoryId: Id, scope: z.enum(["Global", "Role", "Private"]), value: Summary, sourceIds: z.array(Id).max(64), confidence: z.number().min(0).max(1) });
export const TaskViewSchema = z.strictObject({ taskId: Id, conversationId: Id, runId: Id, version: Version, status: z.enum(["queued", "running", "completed", "failed", "cancelled", "unknown"]), summary: Summary, allowedActions: Actions, evidenceRefs: z.array(Id).max(64) });
export const ToolViewSchema = z.strictObject({ toolId: Id, conversationId: Id, runId: Id, version: Version, status: z.enum(["planned", "executing", "succeeded", "failed", "unknown"]), summary: Summary, allowedActions: Actions, evidenceRefs: z.array(Id).max(64) });
export const ArtifactViewSchema = z.strictObject({ artifactId: Id, conversationId: Id, runId: Id, version: Version, title: Summary, mediaType: z.string().max(128), contentRef: Id, allowedActions: Actions, preview: Summary.optional() });
export const UsageViewSchema = z.strictObject({ inputTokens: Revision.nullable(), outputTokens: Revision.nullable(), costMicroUsd: MicroUsdSchema.nullable() });
export const SettingsViewSchema = z.strictObject({ ...view, availability: Availability, privacyMode: z.enum(["local_only", "redacted_cloud", "unavailable"]), spendLimitMicroUsd: MicroUsdSchema.nullable(), retentionDays: Revision.nullable(), notifications: z.boolean(), scheduleEnabled: z.boolean() });
export const PageSchema = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(100), nextCursor: Id.nullable() });
export const CatalogSchema = <T extends z.ZodType>(item: T) => z.strictObject({ items: z.array(item).max(1000), revision: Revision, availability: Availability, reason: Summary.optional() });

export const UiEventTypeSchema = z.enum([
  "message.created", "message.delta", "message.completed", "run.status",
  "clarification.requested", "clarification.resolved", "approval.requested", "approval.resolved",
  "task.updated", "tool.updated", "artifact.ready", "model.effective", "usage.updated",
  "conversation.updated", "notice", "error",
  "goal.updated", "plan.updated", "verification.completed", "project.updated",
]);

// Section 6 safe V2 projections: no policy tokens, credentials, raw prompts or private chain-of-thought.
const projection = { conversationId: Id, revision: Revision, allowedActions: Actions };
export const GoalViewSchema = z.strictObject({ ...projection, goalId: Id, runId: Id, status: z.enum(["draft", "ready", "running", "waiting_input", "waiting_approval", "suspended", "verified", "unmet", "cancelled", "failed"]), objective: Summary, criteria: z.array(z.strictObject({ criterionId: Id, description: Summary, required: z.boolean() })).max(32) });
export const PlanStepViewSchema = z.strictObject({ stepId: Id, summary: Summary, status: z.enum(["pending", "running", "completed", "failed", "blocked", "unknown"]), dependsOn: z.array(Id).max(64) });
export const PlanViewSchema = z.strictObject({ ...projection, planId: Id, goalId: Id, runId: Id, goalRevision: Revision, status: z.enum(["pending", "active", "completed", "failed", "cancelled", "unknown"]), steps: z.array(PlanStepViewSchema).max(64) });
export const VerificationViewSchema = z.strictObject({ ...projection, reportId: Id, goalId: Id, runId: Id, goalRevision: Revision, status: z.enum(["verified", "unmet", "partial", "unknown"]), criterionResults: z.array(z.strictObject({ criterionId: Id, satisfied: z.boolean().nullable(), evidenceRefs: z.array(Id).max(64), safeReason: Summary })).max(32), checkedAt: Timestamp, limitations: z.array(Summary).max(64) });
export const ProjectBlockerViewSchema = z.strictObject({ blockerId: Id, description: Summary, blockedGoalIds: z.array(Id).max(256) });
export const ProjectViewSchema = z.strictObject({ ...projection, projectId: Id, version: Version, status: z.enum(["active", "suspended", "completed", "cancelled"]), summary: Summary, progress: z.number().min(0).max(1), blockers: z.array(ProjectBlockerViewSchema).max(256) });

const ref = <T extends string>(type: T) => z.strictObject({ type: z.literal(type), partId: Id, referenceId: Id });
export const UiMessagePartSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), partId: Id, text: z.string().max(1048576) }),
  z.strictObject({ type: z.literal("citation"), partId: Id, title: Summary, url: z.url().refine(value => /^https?:\/\//.test(value), "HTTP(S) URL required") }),
  z.strictObject({ type: z.literal("status-summary"), partId: Id, summary: Summary }),
  ref("attachment"), ref("task-reference"), ref("tool-reference"), ref("artifact-reference"), ref("clarification-reference"), ref("approval-reference"),
]);
export const UiMessageSchema = z.strictObject({ messageId: Id, role: z.enum(["user", "assistant", "system-notice"]), createdAt: Timestamp, parts: z.array(UiMessagePartSchema).max(256) });
export const ConversationSummarySchema = z.strictObject({ conversationId: Id, workspaceId: Id, title: z.string().min(1).max(256), lastUpdatedAt: Timestamp, pendingDecisionCount: Revision, activeRun: RunStatusSchema.nullable(), revision: Revision });
export const WorkspaceSessionSchema = z.strictObject({ workspaceId: Id, displayName: Summary, subjectId: Id, allowedActions: Actions, demoMode: z.boolean(), csrfToken: Id, limits: z.strictObject({ maxMessageBytes: z.number().int().positive(), maxAttachmentBytes: Revision, maxAttachmentCount: Revision }), supportedEvents: z.array(UiEventTypeSchema).max(64).optional() });
export const ConversationSnapshotSchema = z.strictObject({ conversationId: Id, workspaceId: Id, revision: Revision, lastEventSequence: Revision, messages: z.array(UiMessageSchema).max(10000), interactions: z.array(InteractionSchema).max(1000), tasks: z.array(TaskViewSchema).max(1000), tools: z.array(ToolViewSchema).max(1000), artifacts: z.array(ArtifactViewSchema).max(1000), goals: z.array(GoalViewSchema).max(1000).optional(), plans: z.array(PlanViewSchema).max(1000).optional(), verifications: z.array(VerificationViewSchema).max(1000).optional(), projects: z.array(ProjectViewSchema).max(1000).optional(), runStatus: RunStatusSchema.nullable(), activeRunId: Id.nullable().optional(), effectiveModel: Id.nullable(), usage: UsageViewSchema, composerCapabilities: Actions }).refine(snapshot => [...snapshot.interactions, ...snapshot.tasks, ...snapshot.tools, ...snapshot.artifacts, ...(snapshot.goals ?? []), ...(snapshot.plans ?? []), ...(snapshot.verifications ?? []), ...(snapshot.projects ?? [])].every(item => item.conversationId === snapshot.conversationId), "snapshot projections must belong to the conversation");

const event = <T extends string, P extends z.ZodType>(eventType: T, payload: P) => z.strictObject({ schemaVersion: z.literal(1), eventId: Id, conversationId: Id, sequence: z.number().int().positive(), occurredAt: Timestamp, eventType: z.literal(eventType), payload });
export const UiEventSchema = z.discriminatedUnion("eventType", [
  event("message.created", UiMessageSchema), event("message.delta", z.strictObject({ messageId: Id, partId: Id, deltaIndex: Revision, text: z.string().max(65536) })), event("message.completed", z.strictObject({ messageId: Id })),
  event("run.status", z.strictObject({ runId: Id, status: RunStatusSchema, suspendReason: z.literal("user_input").optional() })),
  event("clarification.requested", ClarificationRequestSchema), event("clarification.resolved", ClarificationRequestSchema), event("approval.requested", UiApprovalRequestSchema), event("approval.resolved", UiApprovalRequestSchema),
  event("task.updated", TaskViewSchema), event("tool.updated", ToolViewSchema), event("artifact.ready", ArtifactViewSchema), event("model.effective", z.strictObject({ modelId: Id })), event("usage.updated", UsageViewSchema),
  event("conversation.updated", ConversationSummarySchema), event("notice", z.strictObject({ summary: Summary })), event("error", NormalizedErrorSchema),
  event("goal.updated", GoalViewSchema), event("plan.updated", PlanViewSchema), event("verification.completed", VerificationViewSchema), event("project.updated", ProjectViewSchema),
]).refine(value => !("conversationId" in value.payload) || value.payload.conversationId === value.conversationId, "event projection belongs to another conversation");

export type Page<T> = { items: T[]; nextCursor: string | null };
export type Catalog<T> = { items: T[]; revision: number; availability: z.infer<typeof Availability>; reason?: string | undefined };
export type SendMessageInput = z.infer<typeof SendMessageInputSchema>;
export type ClarificationAnswer = z.infer<typeof ClarificationAnswerSchema>;
export type ApprovalDecisionInput = z.infer<typeof ApprovalDecisionInputSchema>;
export type ConversationPatch = z.infer<typeof ConversationPatchSchema>;
export type UploadIntent = z.infer<typeof UploadIntentSchema>;
export type UploadView = z.infer<typeof UploadViewSchema>;
export type MemorySearchInput = z.infer<typeof MemorySearchInputSchema>;
export type ActivityQuery = z.infer<typeof ActivityQuerySchema>;
export type UiMutationCommand = z.infer<typeof UiMutationCommandSchema>;
export type UiCommandResult = z.infer<typeof UiCommandResultSchema>;
export type ClarificationRequest = z.infer<typeof ClarificationRequestSchema>;
export type UiApprovalRequest = z.infer<typeof UiApprovalRequestSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type ProviderView = z.infer<typeof ProviderViewSchema>;
export type ModelView = z.infer<typeof ModelViewSchema>;
export type SkillView = z.infer<typeof SkillViewSchema>;
export type ConnectionView = z.infer<typeof ConnectionViewSchema>;
export type MemoryView = z.infer<typeof MemoryViewSchema>;
export type TaskView = z.infer<typeof TaskViewSchema>;
export type ToolView = z.infer<typeof ToolViewSchema>;
export type ArtifactView = z.infer<typeof ArtifactViewSchema>;
export type UsageView = z.infer<typeof UsageViewSchema>;
export type SettingsView = z.infer<typeof SettingsViewSchema>;
export type UiMessage = z.infer<typeof UiMessageSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ConversationSnapshot = z.infer<typeof ConversationSnapshotSchema>;
export type WorkspaceSession = z.infer<typeof WorkspaceSessionSchema>;
export type UiEvent = z.infer<typeof UiEventSchema>;
export type UiEventType = z.infer<typeof UiEventTypeSchema>;
export type GoalView = z.infer<typeof GoalViewSchema>;
export type PlanStepView = z.infer<typeof PlanStepViewSchema>;
export type PlanView = z.infer<typeof PlanViewSchema>;
export type VerificationView = z.infer<typeof VerificationViewSchema>;
export type ProjectBlockerView = z.infer<typeof ProjectBlockerViewSchema>;
export type ProjectView = z.infer<typeof ProjectViewSchema>;

export function isCurrentVerification(verification: VerificationView, goal: { goalId: string; revision: number }): boolean {
  return verification.goalId === goal.goalId && verification.goalRevision === goal.revision && verification.status === "verified";
}

