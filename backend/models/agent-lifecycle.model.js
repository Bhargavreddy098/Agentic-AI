import { AgentLifecycleResultSchema, AgentLifecycleTransitionInputSchema } from '../schemas/agent-lifecycle.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createAgentLifecycleModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async registerAgent(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(AgentLifecycleResultSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid agent lifecycle record');
            return store.set(ctx.tenantId, parsed.agentId, parsed);
        },
        async getAgent(agentId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, agentId);
        },
        async transitionAgent(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(AgentLifecycleTransitionInputSchema, input, 'Invalid agent lifecycle transition');
            const existing = store.get(ctx.tenantId, parsed.agentId);
            if (!existing) {
                throw new ModelDomainError('NOT_FOUND', 'Agent lifecycle record not found.', 404);
            }
            if (existing.version !== parsed.expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale agent lifecycle version.', 409);
            }
            if ((existing.lifecycle === 'stopped' || existing.lifecycle === 'revoked') && parsed.targetLifecycle === 'active' && !parsed.currentGrantRef) {
                throw new ModelDomainError('POLICY_DENIED', 'Stopped or revoked agent cannot resume without a current authorization grantRef.', 403);
            }
            const next = parseSchema(AgentLifecycleResultSchema, {
                ...existing,
                lifecycle: parsed.targetLifecycle,
                currentGrantRef: parsed.targetLifecycle === 'stopped' || parsed.targetLifecycle === 'revoked' ? null : (parsed.currentGrantRef ?? existing.currentGrantRef),
                nextScheduleRef: parsed.targetLifecycle === 'stopped' || parsed.targetLifecycle === 'revoked' ? null : existing.nextScheduleRef,
                owningRunId: parsed.targetLifecycle === 'stopped' ? null : (parsed.owningRunId !== undefined ? parsed.owningRunId : existing.owningRunId),
                checkpointRef: parsed.checkpointRef !== undefined ? parsed.checkpointRef : existing.checkpointRef,
                lastTransitionAt: parsed.transitionAt ?? ctx.now ?? new Date().toISOString(),
                version: existing.version + 1,
            });
            return { status: 'updated', record: store.set(ctx.tenantId, next.agentId, next) };
        },
        async listAgents(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid agent list query');
            const items = store.list(ctx.tenantId, item => !q.status || item.lifecycle === q.status);
            return paginateItems(items, q, 'agentId');
        },
    };
}
