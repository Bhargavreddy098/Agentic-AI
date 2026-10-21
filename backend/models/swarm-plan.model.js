import { SwarmPlanSchema } from '../schemas/swarm-plan.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createSwarmPlanModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendSwarmPlan(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.dispatched === true || (input?.workerAssignments ?? []).some(w => w?.unrestrictedPeerGrant === true)) {
                throw new ModelDomainError('POLICY_DENIED', 'Swarm plan never dispatches directly and never grants unrestricted peer authority.', 403);
            }
            const parsed = parseSchema(SwarmPlanSchema, { ...input, tenantId: ctx.tenantId, dispatched: false }, 'Invalid swarm plan');
            const existing = store.get(ctx.tenantId, parsed.swarmPlanId);
            if (existing) {
                if (existing.planRef === parsed.planRef && existing.goalRef === parsed.goalRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Swarm plan ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.swarmPlanId, parsed) };
        },
        async getSwarmPlan(swarmPlanId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, swarmPlanId);
        },
    };
}
