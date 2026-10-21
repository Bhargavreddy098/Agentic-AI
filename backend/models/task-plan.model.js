import { TaskPlanSchema } from '../schemas/task-plan.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

function validateDagSteps(steps) {
    const stepIds = new Set();
    for (const step of steps) {
        if (stepIds.has(step.stepId)) {
            throw new ModelDomainError('INVALID_INPUT', `Duplicate stepId '${step.stepId}' in TaskPlan.`, 400);
        }
        stepIds.add(step.stepId);
    }
    const adj = new Map();
    for (const step of steps) {
        for (const dep of step.dependsOn) {
            if (!stepIds.has(dep)) {
                throw new ModelDomainError('INVALID_INPUT', `Step '${step.stepId}' depends on unknown step '${dep}'.`, 400);
            }
        }
        adj.set(step.stepId, step.dependsOn);
    }
    const visiting = new Set();
    const visited = new Set();
    function dfs(node) {
        if (visiting.has(node)) {
            throw new ModelDomainError('INVALID_INPUT', `Cycle detected in TaskPlan steps involving '${node}'.`, 400);
        }
        if (visited.has(node)) return;
        visiting.add(node);
        for (const dep of adj.get(node) ?? []) dfs(dep);
        visiting.delete(node);
        visited.add(node);
    }
    for (const id of stepIds) dfs(id);
}

export function createTaskPlanModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createPlan(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(TaskPlanSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid task plan');
            validateDagSteps(parsed.steps);
            const existing = store.get(ctx.tenantId, parsed.planId);
            if (existing) {
                if (existing.planDigest === parsed.planDigest && existing.goalRevision === parsed.goalRevision) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Task plan ID already exists with different digest or goalRevision.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.planId, parsed) };
        },
        async getPlan(planId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, planId);
        },
        async revisePlan(input, expectedRevision, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.planId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.revision !== expectedRevision) {
                throw new ModelDomainError('STALE_REVISION', 'Stale task plan revision.', 409);
            }
            const next = parseSchema(TaskPlanSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                revision: existing.revision + 1,
            }, 'Invalid task plan revision');
            validateDagSteps(next.steps);
            return { status: 'updated', record: store.set(ctx.tenantId, next.planId, next) };
        },
        async listPlans(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid task plan list query');
            return paginateItems(store.list(ctx.tenantId), q, 'planId');
        },
    };
}
