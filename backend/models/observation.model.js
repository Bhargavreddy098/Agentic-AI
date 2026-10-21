import { ObservationSchema, GraphQuerySchema } from '../schemas/observation.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

function isVisibleToContext(obs, ctx, permittedScopes, nowMs) {
    if (!permittedScopes.includes(obs.scope)) return false;
    if (obs.validUntil && Date.parse(obs.validUntil) <= nowMs) return false;
    if (obs.scope === 'Global') return true;
    if (obs.scope === 'Private') return Boolean(ctx.agentId && obs.ownerAgentId === ctx.agentId);
    if (obs.scope === 'Role') return Boolean(obs.roleId && ctx.roleIds.includes(obs.roleId));
    return false;
}

export function createObservationModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async getObservation(observationId, context) {
            const ctx = validateContext(context);
            const obs = store.get(ctx.tenantId, observationId);
            if (!obs) return null;
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            if (!isVisibleToContext(obs, ctx, ctx.requestedScopes, nowMs)) return null;
            return obs;
        },
        async reviseObservation(input, expectedRevision, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.observationId);
            if (!existing) {
                if (expectedRevision && expectedRevision !== 1) {
                    throw new ModelDomainError('STALE_REVISION', 'Observation does not exist for revision > 1.', 409);
                }
                const created = parseSchema(ObservationSchema, { ...input, tenantId: ctx.tenantId, revision: 1 }, 'Invalid observation');
                if (created.scope === 'Private' && !created.ownerAgentId) {
                    throw new ModelDomainError('INVALID_INPUT', 'Private observation requires ownerAgentId.', 400);
                }
                if (created.scope === 'Role' && !created.roleId) {
                    throw new ModelDomainError('INVALID_INPUT', 'Role observation requires roleId.', 400);
                }
                return { status: 'created', record: store.set(ctx.tenantId, created.observationId, created) };
            }
            if (existing.revision !== expectedRevision) {
                throw new ModelDomainError('STALE_REVISION', 'Stale observation revision.', 409);
            }
            const updated = parseSchema(ObservationSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                revision: existing.revision + 1,
            }, 'Invalid observation revision');
            return { status: 'updated', record: store.set(ctx.tenantId, updated.observationId, updated) };
        },
        async queryGraph(query, context) {
            const ctx = validateContext(context);
            const q = parseSchema(GraphQuerySchema, query, 'Invalid graph query');
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            const allowedScopes = q.permittedScopeRefs.filter(s => ctx.requestedScopes.includes(s));
            const allVisible = store.list(ctx.tenantId, obs => isVisibleToContext(obs, ctx, allowedScopes, nowMs));

            const visitedEntities = new Set(q.entityRefs);
            const matched = [];
            const matchedIds = new Set();
            let frontier = new Set(q.entityRefs);

            for (let depth = 1; depth <= q.maxDepth; depth++) {
                const nextFrontier = new Set();
                for (const obs of allVisible) {
                    if (!frontier.has(obs.entity)) continue;
                    if (q.relationTypes && q.relationTypes.length > 0 && !q.relationTypes.includes(obs.relation)) continue;
                    if (!matchedIds.has(obs.observationId)) {
                        matchedIds.add(obs.observationId);
                        matched.push(obs);
                    }
                    if (!visitedEntities.has(obs.value)) {
                        visitedEntities.add(obs.value);
                        nextFrontier.add(obs.value);
                    }
                }
                frontier = nextFrontier;
                if (frontier.size === 0) break;
            }

            const paged = paginateItems(matched, { limit: q.limit, cursor: q.cursor }, 'observationId');
            return { observations: paged.items, nextCursor: paged.nextCursor };
        },
        async listObservations(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid observation list query');
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            const items = store.list(ctx.tenantId, obs => isVisibleToContext(obs, ctx, ctx.requestedScopes, nowMs));
            return paginateItems(items, q, 'observationId');
        },
    };
}
