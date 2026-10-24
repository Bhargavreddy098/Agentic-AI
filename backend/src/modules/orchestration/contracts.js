// @ts-check
import { z } from 'zod';
import { apiError } from '../../../middlewares/error-handler.js';
/** @type {[string, ...string[]]} */
export const runStates = ['queued', 'executing', 'awaiting_effect_approval', 'paused', 'verifying', 'repairing', 'blocked', 'cancelling', 'verified', 'failed', 'cancelled'];
/** @type {[string, ...string[]]} */
export const taskStates = ['queued', 'running', 'succeeded', 'failed', 'blocked', 'cancelling', 'cancelled', 'unknown'];
/** @type {[string, ...string[]]} */
export const effectStates = ['prepared', 'dispatched', 'succeeded', 'failed', 'unknown', 'reconciled'];
export const terminal = new Set(['verified', 'failed', 'cancelled']);
const transitions = { queued: ['executing', 'blocked', 'cancelling'], executing: ['awaiting_effect_approval', 'paused', 'verifying', 'blocked', 'cancelling', 'failed'], awaiting_effect_approval: ['executing', 'blocked', 'cancelling'], paused: ['executing', 'blocked', 'cancelling'], verifying: ['repairing', 'verified', 'blocked', 'cancelling', 'failed'], repairing: ['executing', 'verifying', 'blocked', 'failed', 'cancelling'], blocked: ['executing', 'verifying', 'cancelling', 'failed'], cancelling: ['cancelled', 'blocked'] };
export function assertTransition(from, to) { if (!transitions[from]?.includes(to))
    throw apiError('STATE_CONFLICT', 'Run state transition is not allowed.', 409); }
export const checkpointSchema = z.object({ schemaVersion: z.literal(1), runId: z.string().uuid(), contractRevisionId: z.string().uuid(), planRevisionId: z.string().uuid(), policyRevisionId: z.string().uuid(), repositorySnapshotId: z.string().uuid(), workspaceTreeDigest: z.string().regex(/^[a-f0-9]{64}$/), epoch: z.string().regex(/^[1-9]\d{0,18}$/), tasks: z.array(z.object({ id: z.string().uuid(), state: z.enum(taskStates), attempt: z.number().int().min(0).max(3), leaseEpoch: z.string().regex(/^\d{1,19}$/) }).strict()).max(1000), completedEffectIds: z.array(z.string().uuid()).max(3000), unresolvedApprovalIds: z.array(z.string().uuid()).max(1000), contextBundleRefs: z.array(z.string().uuid()).max(1000), budget: z.object({ limit: z.string().regex(/^\d{1,19}$/), reserved: z.string().regex(/^\d{1,19}$/), spent: z.string().regex(/^\d{1,19}$/) }).strict(), failureFingerprints: z.array(z.string().regex(/^[a-f0-9]{64}$/)).max(1000) }).strict();
export function validateDag(steps, dependencies) { if (!steps.length || steps.length > 1000 || dependencies.length > 10000)
    throw apiError('INVALID_PLAN', 'A bounded nonempty task DAG is required.', 409); const ids = new Set(steps.map(s => s.id)); if (ids.size !== steps.length)
    throw apiError('INVALID_PLAN', 'Duplicate plan steps.', 409); const incoming = new Map(steps.map(s => [s.id, 0])); const edges = new Map(steps.map(s => [s.id, []])); for (const d of dependencies) {
    if (!ids.has(d.step_id) || !ids.has(d.requires_step_id) || d.step_id === d.requires_step_id)
        throw apiError('INVALID_PLAN', 'Invalid plan dependency.', 409);
    incoming.set(d.step_id, incoming.get(d.step_id) + 1);
    edges.get(d.requires_step_id).push(d.step_id);
} const ready = [...incoming].filter(([, v]) => v === 0).map(([k]) => k); let visited = 0; while (ready.length) {
    const current = ready.pop();
    visited++;
    for (const next of edges.get(current)) {
        incoming.set(next, incoming.get(next) - 1);
        if (incoming.get(next) === 0)
            ready.push(next);
    }
} if (visited !== steps.length)
    throw apiError('INVALID_PLAN', 'Plan contains a cycle.', 409); }
export function effectKey(run, task, index) { if (!Number.isInteger(index) || index < 0 || index > 2)
    throw apiError('INVALID_INPUT', 'Effect index is outside the bounded task contract.'); return `effect:${run.id}:${task.plan_step_id}:${index}:${run.contract_revision_id}`; }
