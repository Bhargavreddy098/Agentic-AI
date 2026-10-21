import { createModelRoutingModel } from '../models/index.js';
import { GovernedGenerateInputSchema, GovernedEmbedInputSchema, UsageReconciliationInputSchema } from '../schemas/index.js';
import { parseSchema, validateContext } from '../../../../models/_shared.js';

export const INFERENCE_OWNED_FAMILIES = ['model-routing'];

export function createInferenceService(owners = {}) {
    const modelRouting = owners.modelRouting ?? createModelRoutingModel();
    const usageRecords = new Map();

    return {
        ownedFamilies: INFERENCE_OWNED_FAMILIES,
        models: { 'model-routing': modelRouting },
        getModel(family) {
            return family === 'model-routing' ? modelRouting : null;
        },
        async routeModel(request, context) {
            return modelRouting.selectApprovedModel(request, context);
        },
        async generate(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(GovernedGenerateInputSchema, input, 'Invalid governed generation input');
            if (!owners.providerAdapter) {
                return {
                    requestId: parsed.requestId,
                    modelRef: parsed.modelRef,
                    status: 'unavailable',
                    reason: 'Approved live provider workload and spending policy are not configured.',
                    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 },
                };
            }
            return owners.providerAdapter.generate(parsed, ctx);
        },
        async embed(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(GovernedEmbedInputSchema, input, 'Invalid governed embedding input');
            if (!owners.providerAdapter) {
                return {
                    requestId: parsed.requestId,
                    modelRef: parsed.modelRef,
                    status: 'unavailable',
                    dimensions: parsed.dimensions,
                    embedding: null,
                };
            }
            return owners.providerAdapter.embed(parsed, ctx);
        },
        async reconcileUsage(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(UsageReconciliationInputSchema, input, 'Invalid usage reconciliation input');
            const record = { ...parsed, tenantId: ctx.tenantId, reconciledAt: ctx.now ?? new Date().toISOString() };
            usageRecords.set(`${ctx.tenantId}::${parsed.requestId}`, record);
            return record;
        },
    };
}
