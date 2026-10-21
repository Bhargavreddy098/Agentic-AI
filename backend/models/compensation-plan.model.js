import { CompensationPlanSchema } from '../schemas/compensation-plan.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createCompensationPlanModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendCompensationPlan(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.universalRollbackGuaranteed === true || input?.autoDispatched === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Compensation plan cannot promise universal rollback or auto-dispatch effects.', 403);
            }
            const parsed = parseSchema(CompensationPlanSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid compensation plan');
            const existing = store.get(ctx.tenantId, parsed.planId);
            if (existing) {
                if (existing.expectedStateDigest === parsed.expectedStateDigest && existing.originalReceiptRef === parsed.originalReceiptRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Compensation plan ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.planId, { ...parsed, dispatched: false }) };
        },
        async getCompensationPlan(planId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, planId);
        },
    };
}
