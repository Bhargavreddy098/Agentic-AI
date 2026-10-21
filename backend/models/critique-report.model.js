import { CritiqueReportSchema } from '../schemas/critique-report.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createCritiqueReportModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendCritique(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.grantsApproval === true || input?.mutatesPolicy === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Critic findings cannot change approval or policy.', 403);
            }
            const parsed = parseSchema(CritiqueReportSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid critique report');
            const existing = store.get(ctx.tenantId, parsed.reportId);
            if (existing) {
                if (existing.taskResultRef === parsed.taskResultRef && existing.round === parsed.round) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Critique report ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.reportId, parsed) };
        },
        async getCritique(reportId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, reportId);
        },
        async listCritiques(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid critique list query');
            return paginateItems(store.list(ctx.tenantId), q, 'reportId');
        },
    };
}
