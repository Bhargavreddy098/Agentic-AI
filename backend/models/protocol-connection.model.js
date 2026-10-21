import { ProtocolConnectionRecordSchema } from '../schemas/protocol-connection.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createProtocolConnectionModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async registerConnection(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            if (input?.rawToken || input?.password || input?.apiKey) {
                throw new ModelDomainError('INVALID_INPUT', 'Freeform credentials are forbidden on protocol connections.', 400);
            }
            const parsed = parseSchema(ProtocolConnectionRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid protocol connection');
            if (!parsed.policyApproved) {
                throw new ModelDomainError('POLICY_DENIED', 'Endpoint policy approval is required before registering protocol connection.', 403);
            }
            const existing = store.get(ctx.tenantId, parsed.connectionId);
            if (existing) {
                if (existing.capabilityDigest === parsed.capabilityDigest && existing.endpointRef === parsed.endpointRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Protocol connection already exists with different parameters.', 409);
            }
            const stored = store.set(ctx.tenantId, parsed.connectionId, parsed);
            return { status: 'created', record: stored };
        },
        async getConnection(connectionId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, connectionId);
        },
        async reviseConnection(input, expectedVersion, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.connectionId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale protocol connection revision.', 409);
            }
            const updated = parseSchema(ProtocolConnectionRecordSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                version: existing.version + 1,
            }, 'Invalid protocol connection revision');
            return { status: 'updated', record: store.set(ctx.tenantId, updated.connectionId, updated) };
        },
        async listConnections(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid protocol connection list query');
            return paginateItems(store.list(ctx.tenantId), q, 'connectionId');
        },
    };
}
