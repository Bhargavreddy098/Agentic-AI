import { expect, it } from "vitest";
import { ConversationSnapshotSchema, UiEventSchema, isCurrentVerification, type UiEvent } from "../../../packages/contracts/src/ui/index.js";
import { hydrateConversation, reduceConversation } from "../../../apps/web/src/lib/chat/reducer.js";

const snapshot = (conversationId = "c1") => ConversationSnapshotSchema.parse({ conversationId, workspaceId: "w1", revision: 9, lastEventSequence: 9, messages: [], interactions: [], tasks: [], tools: [], artifacts: [], runStatus: "running", effectiveModel: null, usage: { inputTokens: null, outputTokens: null, costMicroUsd: null }, composerCapabilities: ["send", "cancel"] });
const goal = (revision: number, conversationId = "c1") => ({ conversationId, revision, allowedActions: [], goalId: "g1", runId: "r1", status: "running", objective: "Ship the demo goal", criteria: [{ criterionId: "k1", description: "Demo criterion", required: true }] });
const plan = (revision: number) => ({ conversationId: "c1", revision, allowedActions: [], planId: "p1", goalId: "g1", runId: "r1", goalRevision: 1, status: "active", steps: [{ stepId: "s1", summary: "Do the work", status: "running", dependsOn: [] }] });
const verification = (revision: number) => ({ conversationId: "c1", revision, allowedActions: [], reportId: "rep1", goalId: "g1", runId: "r1", goalRevision: 1, status: "verified", criterionResults: [{ criterionId: "k1", satisfied: true, evidenceRefs: [], safeReason: "Demo criterion met." }], checkedAt: "2026-10-06T12:00:00Z", limitations: [] });
const project = (revision: number, version = revision) => ({ conversationId: "c1", revision, allowedActions: [], projectId: "pr1", version, status: "active", summary: "Demo project", progress: 0.5, blockers: [] });
const at = (sequence: number, eventType: UiEvent["eventType"], payload: unknown, conversationId = "c1", eventId = `e${sequence}`) => UiEventSchema.parse({ schemaVersion: 1, eventId, conversationId, sequence, occurredAt: "2026-10-06T12:00:00Z", eventType, payload });

it("applies each approved V2 projection and deduplicates a replayed event", () => {
  let state = hydrateConversation(snapshot());
  state = reduceConversation(state, at(10, "goal.updated", goal(1)));
  state = reduceConversation(state, at(11, "plan.updated", plan(2)));
  state = reduceConversation(state, at(12, "verification.completed", verification(3)));
  state = reduceConversation(state, at(13, "project.updated", project(1)));
  expect(state.snapshot.goals).toEqual([goal(1)]);
  expect(state.snapshot.plans).toEqual([plan(2)]);
  expect(state.snapshot.verifications).toEqual([verification(3)]);
  expect(state.snapshot.projects).toEqual([project(1)]);
  expect(reduceConversation(state, at(10, "goal.updated", goal(1)))).toBe(state);
  expect(reduceConversation(state, at(14, "goal.updated", goal(1), "c1", "e10"))).toBe(state);
});

it("keeps the newest projection revision and never regresses on a stale version", () => {
  let state = hydrateConversation(snapshot());
  state = reduceConversation(state, at(10, "goal.updated", goal(3)));
  const stale = reduceConversation(state, at(11, "goal.updated", goal(2)));
  expect(stale.snapshot.goals).toHaveLength(1);
  expect(stale.snapshot.goals?.[0]?.revision).toBe(3);
  const newer = reduceConversation(stale, at(12, "goal.updated", goal(4)));
  expect(newer.snapshot.goals).toHaveLength(1);
  expect(newer.snapshot.goals?.[0]?.revision).toBe(4);
});

it("does not regress a project to an older projection revision even when its own version is higher", () => {
  let state = hydrateConversation(snapshot());
  state = reduceConversation(state, at(10, "project.updated", project(5, 7)));
  state = reduceConversation(state, at(11, "project.updated", project(4, 9)));
  expect(state.snapshot.projects).toEqual([project(5, 7)]);
});

it("requests a resync on a projection sequence gap without applying the event", () => {
  const state = hydrateConversation(snapshot());
  const gap = reduceConversation(state, at(12, "goal.updated", goal(1)));
  expect(gap.needsResync).toBe(true);
  expect(gap.snapshot.goals).toBeUndefined();
  expect(gap.snapshot.lastEventSequence).toBe(9);
});

it("ignores a late projection belonging to another conversation", () => {
  const state = hydrateConversation(snapshot());
  expect(reduceConversation(state, at(10, "goal.updated", goal(1, "c2"), "c2"))).toBe(state);
});

it("treats only the verification matching the goal revision as current", () => {
  let state = hydrateConversation(snapshot());
  state = reduceConversation(state, at(10, "goal.updated", goal(1)));
  state = reduceConversation(state, at(11, "verification.completed", verification(2)));
  const current = state.snapshot.verifications![0]!;
  expect(isCurrentVerification(current, { goalId: "g1", revision: 1 })).toBe(true);
  expect(isCurrentVerification(current, { goalId: "g1", revision: 5 })).toBe(false);
});
