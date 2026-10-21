import { ConsolidationCandidateSchema } from '../schemas/consolidation-candidate.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createConsolidationCandidateModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendCandidate(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.publishedFact === true) {
                throw new ModelDomainError('INVALID_INPUT', 'Consolidation candidate is not a published fact.', 400);
            }
            const parsed = parseSchema(ConsolidationCandidateSchema, {
                ...input,
                tenantId: ctx.tenantId,
                publishedFact: false,
            }, 'Invalid consolidation candidate');
            const existing = store.get(ctx.tenantId, parsed.candidateId);
            if (existing) {
                if (existing.candidateDigest === parsed.candidateDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Consolidation candidate ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.candidateId, parsed) };
        },
        async getCandidate(candidateId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, candidateId);
        },
        async listCandidates(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid consolidation candidate list query');
            return paginateItems(store.list(ctx.tenantId), q, 'candidateId');
        },
    };
}
