import { ActionPreviewSchema } from '../schemas/action-preview.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createActionPreviewModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async appendPreview(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.executedLiveEffect === true) {
                throw new ModelDomainError('POLICY_DENIED', 'Action preview cannot execute live effects during model writes.', 403);
            }
            const parsed = parseSchema(ActionPreviewSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid action preview');
            const existing = store.get(ctx.tenantId, parsed.previewId);
            if (existing) {
                if (existing.inputHash === parsed.inputHash && existing.effectId === parsed.effectId) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Action preview ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.previewId, { ...parsed, liveEffectExecuted: false }) };
        },
        async getPreview(previewId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, previewId);
        },
        async listPreviews(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid action preview list query');
            return paginateItems(store.list(ctx.tenantId), q, 'previewId');
        },
    };
}
