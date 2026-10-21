import { CandidateComparisonSchema } from '../schemas/candidate-comparison.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createCandidateComparisonModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendComparison(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.noLiveWrites === false || input?.authorizedExecution === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Candidate comparison requires noLiveWrites=true and cannot authorize execution.', 403);
            }
            const parsed = parseSchema(CandidateComparisonSchema, { ...input, tenantId: ctx.tenantId, noLiveWrites: true }, 'Invalid candidate comparison');
            if (input?.budgetLimitTokens && parsed.usage.totalTokens > input.budgetLimitTokens) {
                throw new ModelDomainError('QUOTA_EXCEEDED', 'Candidate comparison exceeded shared budget limit.', 409);
            }
            const existing = store.get(ctx.tenantId, parsed.comparisonId);
            if (existing) {
                if (existing.planRef === parsed.planRef && existing.goalRef === parsed.goalRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Candidate comparison ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.comparisonId, parsed) };
        },
        async getComparison(comparisonId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, comparisonId);
        },
    };
}
