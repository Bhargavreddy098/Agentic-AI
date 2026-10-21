import { CredentialResolutionSchema } from '../schemas/credential-binding.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createCredentialBindingModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async registerBinding(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.secretValue || input?.rawKey || input?.password || input?.bearerToken) {
                throw new ModelDomainError('POLICY_DENIED', 'Plaintext credential material is forbidden in credential-binding metadata.', 403);
            }
            const parsed = parseSchema(CredentialResolutionSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid credential binding');
            return store.set(ctx.tenantId, parsed.bindingId, parsed);
        },
        async getBinding(bindingId, context, targetDigest = null) {
            const ctx = validateContext(context);
            const binding = store.get(ctx.tenantId, bindingId);
            if (!binding) return null;
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            if (binding.revokedAt) {
                throw new ModelDomainError('POLICY_DENIED', 'Credential binding has been revoked.', 403);
            }
            if (Date.parse(binding.expiresAt) <= nowMs) {
                throw new ModelDomainError('POLICY_DENIED', 'Credential binding has expired.', 403);
            }
            if (targetDigest && binding.allowedTargetDigest !== targetDigest) {
                throw new ModelDomainError('POLICY_DENIED', 'Target digest does not match allowedTargetDigest on credential binding.', 403);
            }
            return binding;
        },
        async expireBinding(bindingId, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, bindingId);
            if (!existing) return null;
            const expiredAt = ctx.now ?? new Date(0).toISOString();
            return store.set(ctx.tenantId, bindingId, { ...existing, expiresAt: expiredAt });
        },
        async revokeBinding(bindingId, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, bindingId);
            if (!existing) return null;
            const revokedAt = ctx.now ?? new Date().toISOString();
            return store.set(ctx.tenantId, bindingId, { ...existing, revokedAt });
        },
    };
}
