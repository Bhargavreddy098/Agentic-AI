import { MemoryLifecycleRevisionSchema } from '../schemas/memory-lifecycle.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

function canReadMemory(mem, ctx) {
    if (!ctx.requestedScopes.includes(mem.scope)) return false;
    if (mem.scope === 'Global') return true;
    if (mem.scope === 'Private') return Boolean(ctx.agentId && mem.ownerAgentId === ctx.agentId);
    if (mem.scope === 'Role') return Boolean(mem.roleId && ctx.roleIds.includes(mem.roleId));
    return false;
}

export function createMemoryLifecycleModel(options = {}) {
    const memoryStore = createScopedStore(options.memoryStore);
    const revisionLog = new Map();

    return {
        async getMemory(memoryId, context) {
            const ctx = validateContext(context);
            const mem = memoryStore.get(ctx.tenantId, memoryId);
            if (!mem || !canReadMemory(mem, ctx)) return null;
            return mem;
        },
        async reviseMemoryLifecycle(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(MemoryLifecycleRevisionSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid memory lifecycle revision');
            const existing = memoryStore.get(ctx.tenantId, parsed.memoryId);
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();

            if (existing) {
                if (existing.version !== parsed.expectedMemoryVersion) {
                    throw new ModelDomainError('STALE_REVISION', 'Stale memory version during lifecycle revision.', 409);
                }
                const isIncomingExpired = parsed.expiresAt && Date.parse(parsed.expiresAt) <= nowMs;
                if (existing.confidenceBasis === 'verified_user_correction' && isIncomingExpired) {
                    throw new ModelDomainError('CONFLICT', 'Expired fact cannot outrank a verified user correction.', 409);
                }
            } else if (parsed.expectedMemoryVersion !== 1) {
                throw new ModelDomainError('STALE_REVISION', 'Initial memory lifecycle revision requires expectedMemoryVersion=1.', 409);
            }

            const nextVersion = existing ? existing.version + 1 : 1;
            const record = {
                ...parsed,
                version: nextVersion,
            };
            memoryStore.set(ctx.tenantId, record.memoryId, record);
            const key = `${ctx.tenantId}::${record.memoryId}`;
            const list = revisionLog.get(key) ?? [];
            list.push(record);
            revisionLog.set(key, list);
            return { status: existing ? 'updated' : 'created', record };
        },
        async listRevisions(memoryId, query = {}, context) {
            const ctx = validateContext(context);
            const current = memoryStore.get(ctx.tenantId, memoryId);
            if (!current || !canReadMemory(current, ctx)) return { items: [], nextCursor: null };
            const q = parseSchema(ListQuerySchema, query, 'Invalid memory revision list query');
            const list = revisionLog.get(`${ctx.tenantId}::${memoryId}`) ?? [];
            return paginateItems(list, q, 'version');
        },
    };
}
