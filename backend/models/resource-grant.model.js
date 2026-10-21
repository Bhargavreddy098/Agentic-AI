import { ResourceGrantRequestSchema } from '../schemas/resource-grant.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, computeDigest, createScopedStore } from './_shared.js';

export function createResourceGrantModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async requestGrant(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.signingKey || input?.privateKey) {
                throw new ModelDomainError('POLICY_DENIED', 'Signing keys must never be passed on resource grant objects.', 403);
            }
            const parsed = parseSchema(ResourceGrantRequestSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid resource grant request');
            if (parsed.parentGrantId) {
                const parent = store.get(ctx.tenantId, parsed.parentGrantId);
                if (!parent) {
                    throw new ModelDomainError('NOT_FOUND', 'Parent grant not found in tenant scope.', 404);
                }
                if (parent.revokedAt) {
                    throw new ModelDomainError('POLICY_DENIED', 'Cannot delegate from a revoked parent grant.', 403);
                }
                if (Date.parse(parsed.expiresAt) > Date.parse(parent.expiresAt)) {
                    throw new ModelDomainError('POLICY_DENIED', 'Child grant expiry cannot exceed parent grant expiry.', 403);
                }
                const parentCaps = new Set(parent.capabilities);
                for (const cap of parsed.capabilities) {
                    if (!parentCaps.has(cap)) {
                        throw new ModelDomainError('POLICY_DENIED', `Child grant cannot widen capability '${cap}' beyond parent grant.`, 403);
                    }
                }
            }
            const existing = store.get(ctx.tenantId, parsed.grantId);
            if (existing) {
                if (existing.audience === parsed.audience && JSON.stringify(existing.capabilities) === JSON.stringify(parsed.capabilities)) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Grant ID already exists with different parameters.', 409);
            }
            const record = {
                ...parsed,
                signatureDigest: computeDigest({ grantId: parsed.grantId, tenantId: ctx.tenantId, capabilities: parsed.capabilities, expiresAt: parsed.expiresAt }),
            };
            return { status: 'created', record: store.set(ctx.tenantId, parsed.grantId, record) };
        },
        async getGrant(grantId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, grantId);
        },
        async revokeGrant(grantId, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, grantId);
            if (!existing) return null;
            const revokedAt = ctx.now ?? new Date().toISOString();
            return store.set(ctx.tenantId, grantId, { ...existing, revokedAt });
        },
    };
}
