import { AgentVersionManifestSchema } from '../schemas/agent-version.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createAgentVersionModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendVersion(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.deployed === true || input?.updatedHeldOut === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Appending agent version manifest never deploys or updates held-out cases.', 403);
            }
            const parsed = parseSchema(AgentVersionManifestSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid agent version manifest');
            const existing = store.get(ctx.tenantId, parsed.versionId);
            if (existing) {
                if (existing.promptDigest === parsed.promptDigest && existing.configDigest === parsed.configDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Agent version ID already exists with different digests.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.versionId, { ...parsed, deployed: false }) };
        },
        async getVersion(versionId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, versionId);
        },
        async listVersions(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid agent version list query');
            return paginateItems(store.list(ctx.tenantId), q, 'versionId');
        },
    };
}
