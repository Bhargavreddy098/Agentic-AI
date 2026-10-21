import { WorkspaceLeaseSchema } from '../schemas/workspace-lease.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createWorkspaceLeaseModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async recordLease(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.provisionHostFilesystem === true || input?.allowSymlinkEscape === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Workspace lease model cannot provision host filesystem or allow symlink widening.', 403);
            }
            const parsed = parseSchema(WorkspaceLeaseSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid workspace lease');
            const existing = store.get(ctx.tenantId, parsed.leaseId);
            if (existing) {
                if (existing.profileDigest === parsed.profileDigest && existing.workspaceId === parsed.workspaceId) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Workspace lease ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.leaseId, parsed) };
        },
        async getLease(leaseId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, leaseId);
        },
        async expireLease(leaseId, expectedVersion, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, leaseId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale workspace lease version on expire.', 409);
            }
            const next = {
                ...existing,
                cleanupState: 'expired',
                expiresAt: ctx.now ?? new Date(0).toISOString(),
                version: existing.version + 1,
            };
            return { status: 'updated', record: store.set(ctx.tenantId, leaseId, next) };
        },
        async recordCleanup(leaseId, expectedVersion, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, leaseId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale workspace lease version on cleanup.', 409);
            }
            const next = {
                ...existing,
                cleanupState: 'cleaned',
                version: existing.version + 1,
            };
            return { status: 'updated', record: store.set(ctx.tenantId, leaseId, next) };
        },
    };
}
