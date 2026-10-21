import { ChannelBindingRecordSchema, ChannelDeliveryRecordSchema } from '../schemas/channel-delivery.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createChannelDeliveryModel(options = {}) {
    const bindingStore = createScopedStore(options.bindingStore);
    const deliveryStore = createScopedStore(options.deliveryStore);

    return {
        async getBinding(bindingId, context) {
            const ctx = validateContext(context);
            return bindingStore.get(ctx.tenantId, bindingId);
        },
        async bindChannel(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.rawSecret || input?.accessToken || input?.botToken) {
                throw new ModelDomainError('INVALID_INPUT', 'Channel binding accepts opaque credentialHandleRef only; raw credentials forbidden.', 400);
            }
            const parsed = parseSchema(ChannelBindingRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid channel binding');
            const existing = bindingStore.get(ctx.tenantId, parsed.bindingId);
            if (existing) {
                if (existing.externalConversationRef === parsed.externalConversationRef && existing.credentialHandleRef === parsed.credentialHandleRef) {
                    return { status: 'same_existing', record: existing };
                }
                if (parsed.version <= existing.version) {
                    throw new ModelDomainError('STALE_REVISION', 'Channel binding revision must increment.', 409);
                }
            }
            const stored = bindingStore.set(ctx.tenantId, parsed.bindingId, parsed);
            return { status: existing ? 'updated' : 'created', record: stored };
        },
        async recordDelivery(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(ChannelDeliveryRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid channel delivery record');
            return deliveryStore.set(ctx.tenantId, parsed.deliveryId, parsed);
        },
        async getDelivery(deliveryId, context) {
            const ctx = validateContext(context);
            return deliveryStore.get(ctx.tenantId, deliveryId);
        },
        async listDeliveries(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid delivery list query');
            const items = deliveryStore.list(ctx.tenantId, item => !q.status || item.status === q.status);
            return paginateItems(items, q, 'deliveryId');
        },
    };
}
