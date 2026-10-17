import { expect, it } from "vitest";
import {
  GoalViewSchema, PlanViewSchema, VerificationViewSchema, ProjectViewSchema,
  UiEventSchema, UiEventTypeSchema, ConversationSnapshotSchema, WorkspaceSessionSchema,
  SendMessageInputSchema, UiMutationCommandSchema, isCurrentVerification,
} from "../../../packages/contracts/src/ui/index.js";
import type { GatewayClient } from "../../../apps/web/src/lib/gateway/client.js";
import { HttpGatewayClient } from "../../../apps/web/src/lib/gateway/http-client.js";

const goalView = { conversationId: "c-1", revision: 4, allowedActions: ["a-view"], goalId: "g-1", runId: "r-1", status: "running", objective: "Ship the reviewed slice", criteria: [{ criterionId: "cr-1", description: "Tests pass", required: true }] };
const planView = { conversationId: "c-1", revision: 5, allowedActions: [], planId: "p-1", goalId: "g-1", runId: "r-1", goalRevision: 4, status: "active", steps: [{ stepId: "s-1", summary: "Run checks", status: "running", dependsOn: [] }] };
const verificationView = { conversationId: "c-1", revision: 6, allowedActions: [], reportId: "v-1", goalId: "g-1", runId: "r-1", goalRevision: 4, status: "verified", criterionResults: [{ criterionId: "cr-1", satisfied: true, evidenceRefs: ["e-1"], safeReason: "All named checks passed" }], checkedAt: "2026-10-16T00:00:00Z", limitations: ["fixture only"] };
const projectView = { conversationId: "c-1", revision: 7, allowedActions: [], projectId: "pr-1", version: 2, status: "active", summary: "V2 slice", progress: 0.5, blockers: [] };
const uiEvent = (eventType: string, conversationId: string, payload: unknown) => ({ schemaVersion: 1, eventId: `e-${eventType}`, conversationId, sequence: 1, occurredAt: "2026-10-16T00:00:00Z", eventType, payload });

it("accepts safe goal, plan, verification and project projections", () => {
  expect(GoalViewSchema.safeParse(goalView).success).toBe(true);
  expect(PlanViewSchema.safeParse(planView).success).toBe(true);
  expect(VerificationViewSchema.safeParse(verificationView).success).toBe(true);
  expect(ProjectViewSchema.safeParse(projectView).success).toBe(true);
});

it("rejects a projection that belongs to another conversation", () => {
  expect(UiEventSchema.safeParse(uiEvent("goal.updated", "c-2", goalView)).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("plan.updated", "c-2", planView)).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("verification.completed", "c-2", verificationView)).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("project.updated", "c-2", projectView)).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("goal.updated", "c-1", goalView)).success).toBe(true);
});

it("rejects tenant authority and raw secrets in projections", () => {
  expect(GoalViewSchema.safeParse({ ...goalView, tenantId: "t-1" }).success).toBe(false);
  expect(GoalViewSchema.safeParse({ ...goalView, apiKey: "sk-live" }).success).toBe(false);
  expect(PlanViewSchema.safeParse({ ...planView, prompt: "raw chain of thought" }).success).toBe(false);
  expect(VerificationViewSchema.safeParse({ ...verificationView, credential: "secret" }).success).toBe(false);
  expect(ProjectViewSchema.safeParse({ ...projectView, policyToken: "token" }).success).toBe(false);
});

it("rejects invalid projection versions and unknown or re-versioned events", () => {
  expect(UiEventSchema.safeParse({ ...uiEvent("goal.updated", "c-1", goalView), schemaVersion: 2 }).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("goal.removed", "c-1", goalView)).success).toBe(false);
  expect(GoalViewSchema.safeParse({ ...goalView, revision: -1 }).success).toBe(false);
  expect(UiEventSchema.safeParse(uiEvent("goal.updated", "c-1", { ...goalView, status: "made-up" })).success).toBe(false);
});

it("requires command revisions so stale commands cannot be formed", () => {
  expect(SendMessageInputSchema.safeParse({ commandId: "cmd", clientMessageId: "m", text: "hi", attachmentIds: [], requestedSkillIds: [] }).success).toBe(false);
  expect(UiMutationCommandSchema.safeParse({ type: "skill.enable", commandId: "cmd", skillId: "s" }).success).toBe(false);
});

it("keeps older snapshots parseable while adding optional projections", () => {
  const legacy = { conversationId: "c-1", workspaceId: "w-1", revision: 2, lastEventSequence: 1, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: null, effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: [] };
  expect(ConversationSnapshotSchema.safeParse(legacy).success).toBe(true);
  expect(ConversationSnapshotSchema.safeParse({ ...legacy, goals: [goalView] }).success).toBe(true);
  expect(ConversationSnapshotSchema.safeParse({ ...legacy, goals: [{ ...goalView, conversationId: "c-other" }] }).success).toBe(false);
});

it("declares supported projection events on the workspace session", () => {
  const session = { workspaceId: "w-1", displayName: "Workspace", subjectId: "u-1", allowedActions: [], demoMode: true, csrfToken: "csrf", limits: { maxMessageBytes: 1024, maxAttachmentBytes: 1024, maxAttachmentCount: 2 }, supportedEvents: ["goal.updated", "plan.updated", "verification.completed", "project.updated"] };
  expect(WorkspaceSessionSchema.safeParse(session).success).toBe(true);
  expect(UiEventTypeSchema.safeParse("verification.completed").success).toBe(true);
  expect(WorkspaceSessionSchema.safeParse({ ...session, supportedEvents: ["made-up"] }).success).toBe(false);
});

it("does not treat an older-goal-revision verification as current success", () => {
  const verification = VerificationViewSchema.parse(verificationView);
  expect(isCurrentVerification(verification, { goalId: "g-1", revision: 4 })).toBe(true);
  expect(isCurrentVerification(verification, { goalId: "g-1", revision: 5 })).toBe(false);
  expect(isCurrentVerification(verification, { goalId: "g-2", revision: 4 })).toBe(false);
});

it("delivers every projection through the one existing Gateway client", () => {
  const client: GatewayClient = new HttpGatewayClient("demo", "http://127.0.0.1:4300");
  expect(typeof client.getSnapshot).toBe("function");
});
