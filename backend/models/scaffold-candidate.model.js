import { ScaffoldCandidateRecordSchema } from '../schemas/scaffold-candidate.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createScaffoldCandidateModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendCandidate(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(ScaffoldCandidateRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid scaffold candidate');
            const existing = store.get(ctx.tenantId, parsed.candidateId);
            if (existing) {
                if (existing.candidateDigest === parsed.candidateDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Scaffold candidate ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.candidateId, { ...parsed, promoted: false }) };
        },
        async getCandidate(candidateId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, candidateId);
        },
        async listCandidates(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid scaffold candidate list query');
            return paginateItems(store.list(ctx.tenantId), q, 'candidateId');
        },
    };
}
