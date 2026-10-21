import { DebateReportSchema } from '../schemas/debate-report.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createDebateReportModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendDebate(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(DebateReportSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid debate report');
            const existing = store.get(ctx.tenantId, parsed.debateId);
            if (existing) {
                if (existing.proposalVersionRef === parsed.proposalVersionRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Debate report ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.debateId, parsed) };
        },
        async getDebate(debateId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, debateId);
        },
    };
}
