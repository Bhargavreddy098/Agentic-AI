import { SecurityAlertSchema } from '../schemas/security-alert.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createSecurityAlertModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendAlert(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.grantPermissions === true || input?.mutatePolicy === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Security monitor can observe and report only; cannot grant permissions or mutate policy.', 403);
            }
            const parsed = parseSchema(SecurityAlertSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid security alert');
            const existing = store.get(ctx.tenantId, parsed.alertId);
            if (existing) {
                if (existing.signedReceiptRef === parsed.signedReceiptRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Security alert ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.alertId, parsed) };
        },
        async getAlert(alertId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, alertId);
        },
        async listAlerts(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid security alert list query');
            return paginateItems(store.list(ctx.tenantId), q, 'alertId');
        },
    };
}
