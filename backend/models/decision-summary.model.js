import { DecisionSummarySchema } from '../schemas/decision-summary.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createDecisionSummaryModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async projectDecisionSummary(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.rawPrompt || input?.chainOfThought || input?.secretKey) {
                throw new ModelDomainError('POLICY_DENIED', 'Decision summary projection must not include raw prompts, chain-of-thought, or secrets.', 403);
            }
            const parsed = parseSchema(DecisionSummarySchema, { ...input, tenantId: ctx.tenantId }, 'Invalid decision summary');
            return store.set(ctx.tenantId, parsed.decisionId, parsed);
        },
        async getDecisionSummary(decisionId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, decisionId);
        },
        async listDecisionSummaries(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid decision summary list query');
            return paginateItems(store.list(ctx.tenantId), q, 'decisionId');
        },
    };
}
