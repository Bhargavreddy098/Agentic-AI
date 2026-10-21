import { TriggerAcceptanceSchema } from '../schemas/trigger.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

export function createTriggerModel(options = {}) {
    const store = createScopedStore(options.store);
    const dedupMap = new Map();
    const maxCapacityPerSource = options.maxCapacityPerSource ?? 100;

    return {
        async acceptTrigger(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(TriggerAcceptanceSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid trigger acceptance');
            const dedupKey = `${ctx.tenantId}::${parsed.sourceId}::${parsed.externalEventId}`;
            const existingId = dedupMap.get(dedupKey);

            if (existingId) {
                const prev = store.get(ctx.tenantId, existingId);
                if (prev.observedDigest !== parsed.observedDigest) {
                    throw new ModelDomainError('CONFLICT', 'External event ID reused with altered payload digest.', 409);
                }
                return { status: 'same_existing', record: { ...prev, duplicate: true } };
            }

            const countForSource = store.list(ctx.tenantId, item => item.sourceId === parsed.sourceId).length;
            const status = countForSource >= maxCapacityPerSource ? 'rate_limited' : parsed.status;
            const record = { ...parsed, duplicate: false, status };
            store.set(ctx.tenantId, record.acceptedId, record);
            dedupMap.set(dedupKey, record.acceptedId);
            return { status: 'created', record };
        },
        async getTriggerAcceptance(acceptedId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, acceptedId);
        },
    };
}
