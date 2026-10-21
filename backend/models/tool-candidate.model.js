import { ToolCandidateRecordSchema } from '../schemas/tool-candidate.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createToolCandidateModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendCandidate(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.promoted === true || input?.selfSigned === true || input?.modifiedProtectedEvals === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Tool candidate cannot sign, promote, or edit protected evaluations.', 403);
            }
            const parsed = parseSchema(ToolCandidateRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid tool candidate');
            const existing = store.get(ctx.tenantId, parsed.candidateId);
            if (existing) {
                if (existing.manifestDigest === parsed.manifestDigest && existing.artifactDigest === parsed.artifactDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Tool candidate conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.candidateId, parsed) };
        },
        async getCandidate(candidateId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, candidateId);
        },
        async listCandidates(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid tool candidate list query');
            return paginateItems(store.list(ctx.tenantId), q, 'candidateId');
        },
    };
}
