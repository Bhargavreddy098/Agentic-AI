import { RestoreReportSchema } from '../schemas/restore-report.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createRestoreReportModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendRestoreReport(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(RestoreReportSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid restore report');
            const existing = store.get(ctx.tenantId, parsed.restoreId);
            if (existing) {
                if (existing.backupDigest === parsed.backupDigest && existing.backupArtifactRef === parsed.backupArtifactRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Restore report ID already exists with different digest.', 409);
            }
            const stored = store.set(ctx.tenantId, parsed.restoreId, {
                ...parsed,
                mutatedLiveDatabase: false,
            });
            return { status: 'created', record: stored };
        },
        async getRestoreReport(restoreId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, restoreId);
        },
    };
}
