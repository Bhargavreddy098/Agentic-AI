import { RemoteTaskRecordSchema, RemoteTaskTransitionInputSchema } from '../schemas/remote-task.schema.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, createScopedStore } from './_shared.js';

const TERMINAL_STATES = new Set(['completed', 'failed', 'canceled']);

export function createRemoteTaskModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createRemoteTask(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(RemoteTaskRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid remote task');
            const existing = store.get(ctx.tenantId, parsed.remoteTaskId);
            if (existing) {
                if (existing.localTaskId === parsed.localTaskId && existing.remoteAgentRef === parsed.remoteAgentRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Remote task ID already bound to another task.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.remoteTaskId, parsed) };
        },
        async getRemoteTask(remoteTaskId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, remoteTaskId);
        },
        async transitionRemoteTask(input, context) {
            const ctx = validateContext(context);
            const parsed = parseSchema(RemoteTaskTransitionInputSchema, input, 'Invalid remote task transition');
            const existing = store.get(ctx.tenantId, parsed.remoteTaskId);
            if (!existing) {
                throw new ModelDomainError('NOT_FOUND', 'Remote task not found.', 404);
            }
            if (existing.version !== parsed.expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale remote task version.', 409);
            }
            if (TERMINAL_STATES.has(existing.status) && existing.status !== parsed.nextStatus) {
                throw new ModelDomainError('CONFLICT', `Terminal remote task in state '${existing.status}' cannot be resurrected to '${parsed.nextStatus}'.`, 409);
            }
            const next = {
                ...existing,
                status: parsed.nextStatus,
                resultDigest: parsed.resultDigest !== undefined ? parsed.resultDigest : existing.resultDigest,
                version: existing.version + 1,
            };
            return { status: 'updated', record: store.set(ctx.tenantId, next.remoteTaskId, next) };
        },
    };
}
