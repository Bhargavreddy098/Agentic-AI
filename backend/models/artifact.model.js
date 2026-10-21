import { ArtifactCandidateSchema } from '../schemas/artifact.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createArtifactModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async registerArtifact(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.published === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Artifact metadata registration never publishes or exports directly.', 403);
            }
            const parsed = parseSchema(ArtifactCandidateSchema, { ...input, tenantId: ctx.tenantId, published: false }, 'Invalid artifact candidate');
            if (parsed.trustedStoreDigest && parsed.trustedStoreDigest !== parsed.sha256) {
                throw new ModelDomainError('CONFLICT', 'Registered artifact sha256 does not match trusted artifact-store digest.', 409);
            }
            const existing = store.get(ctx.tenantId, parsed.artifactId);
            if (existing) {
                if (existing.sha256 === parsed.sha256) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Artifact ID already exists with different sha256 digest.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.artifactId, parsed) };
        },
        async getArtifact(artifactId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, artifactId);
        },
        async listArtifacts(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid artifact list query');
            return paginateItems(store.list(ctx.tenantId), q, 'artifactId');
        },
    };
}
