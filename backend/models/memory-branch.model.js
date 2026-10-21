import { MemoryBranchRecordSchema, MemoryBranchQuerySchema, MemoryBranchResultSchema } from '../schemas/memory-branch.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

const SCOPE_RANK = { Private: 1, Role: 2, Global: 3 };

export function createMemoryBranchModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createBranch(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(MemoryBranchRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid memory branch');
            if (parsed.parentBranchId) {
                if (parsed.parentBranchId === parsed.branchId) {
                    throw new ModelDomainError('INVALID_INPUT', 'Memory branch cannot be its own parent.', 400);
                }
                const parent = store.get(ctx.tenantId, parsed.parentBranchId);
                if (!parent) {
                    throw new ModelDomainError('NOT_FOUND', 'Parent memory branch not found in same tenant.', 404);
                }
                const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
                if (Date.parse(parent.expiresAt) <= nowMs) {
                    throw new ModelDomainError('POLICY_DENIED', 'Cannot branch from an expired parent memory branch.', 403);
                }
                if (SCOPE_RANK[parsed.visibilityScope] > SCOPE_RANK[parent.visibilityScope]) {
                    throw new ModelDomainError('POLICY_DENIED', 'Memory branch cannot widen visibilityScope beyond parent (no Private-to-Global copy).', 403);
                }
            }
            const existing = store.get(ctx.tenantId, parsed.branchId);
            if (existing) {
                if (existing.parentBranchId === parsed.parentBranchId && existing.visibilityScope === parsed.visibilityScope) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Memory branch ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.branchId, parsed) };
        },
        async getBranch(branchId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, branchId);
        },
        async reviseBranch(input, expectedVersion, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.branchId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale memory branch version.', 409);
            }
            if (input.visibilityScope && SCOPE_RANK[input.visibilityScope] > SCOPE_RANK[existing.visibilityScope]) {
                throw new ModelDomainError('POLICY_DENIED', 'Cannot widen memory branch visibilityScope.', 403);
            }
            const next = parseSchema(MemoryBranchRecordSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                version: existing.version + 1,
            }, 'Invalid memory branch revision');
            return { status: 'updated', record: store.set(ctx.tenantId, next.branchId, next) };
        },
        async queryBranch(query, context) {
            const ctx = validateContext(context);
            const q = parseSchema(MemoryBranchQuerySchema, query, 'Invalid memory branch query');
            const nowMs = ctx.now ? Date.parse(ctx.now) : Date.now();
            const branch = store.get(ctx.tenantId, q.branchId);
            if (!branch) throw new ModelDomainError('NOT_FOUND', 'Memory branch not found.', 404);
            if (branch.version !== q.expectedBranchVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Expected branch version mismatch.', 409);
            }

            const ancestry = [];
            const versions = {};
            const collectedRefs = [];
            const visited = new Set();
            let cursorBranch = branch;

            while (cursorBranch) {
                if (visited.has(cursorBranch.branchId)) {
                    throw new ModelDomainError('CONFLICT', 'Cycle detected in memory branch ancestry.', 409);
                }
                visited.add(cursorBranch.branchId);
                if (Date.parse(cursorBranch.expiresAt) <= nowMs) {
                    throw new ModelDomainError('POLICY_DENIED', `Ancestor branch '${cursorBranch.branchId}' is expired.`, 403);
                }
                if (!q.requestedScopeRefs.includes(cursorBranch.visibilityScope)) {
                    throw new ModelDomainError('POLICY_DENIED', `Branch visibility '${cursorBranch.visibilityScope}' is outside requested scopes.`, 403);
                }
                ancestry.push(cursorBranch.branchId);
                versions[cursorBranch.branchId] = cursorBranch.version;
                for (const ref of cursorBranch.memoryRefs) {
                    if (!collectedRefs.includes(ref)) collectedRefs.push(ref);
                }
                cursorBranch = cursorBranch.parentBranchId ? store.get(ctx.tenantId, cursorBranch.parentBranchId) : null;
            }

            const paged = paginateItems(collectedRefs.map(id => ({ id })), { limit: q.limit, cursor: q.cursor }, 'id');
            return parseSchema(MemoryBranchResultSchema, {
                ancestry,
                matchingMemoryRefs: paged.items.map(i => i.id),
                versions,
                nextCursor: paged.nextCursor,
            });
        },
    };
}
