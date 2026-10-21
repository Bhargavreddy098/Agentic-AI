import { DurableConversationRecordSchema, DurableGoalRecordSchema } from '../schemas/conversation-goal.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createConversationGoalModel(options = {}) {
    const convStore = createScopedStore(options.convStore);
    const goalStore = createScopedStore(options.goalStore);

    return {
        async createOrGetConversation(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(DurableConversationRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid durable conversation');
            const existing = convStore.get(ctx.tenantId, parsed.conversationId);
            if (existing) {
                if (existing.title === parsed.title) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Conversation ID already exists with different payload.', 409);
            }
            return { status: 'created', record: convStore.set(ctx.tenantId, parsed.conversationId, parsed) };
        },
        async getConversation(conversationId, context) {
            const ctx = validateContext(context);
            return convStore.get(ctx.tenantId, conversationId);
        },
        async reviseConversation(conversationId, patch, expectedRevision, context) {
            const ctx = validateContext(context);
            const existing = convStore.get(ctx.tenantId, conversationId);
            if (!existing) throw new ModelDomainError('NOT_FOUND', 'Conversation not found.', 404);
            if (existing.revision !== expectedRevision) {
                throw new ModelDomainError('STALE_REVISION', 'Stale conversation revision.', 409);
            }
            const next = parseSchema(DurableConversationRecordSchema, {
                ...existing,
                ...patch,
                conversationId,
                tenantId: ctx.tenantId,
                revision: existing.revision + 1,
                updatedAt: ctx.now ?? new Date().toISOString(),
            });
            return { status: 'updated', record: convStore.set(ctx.tenantId, conversationId, next) };
        },
        async listConversations(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query);
            return paginateItems(convStore.list(ctx.tenantId), q, 'conversationId');
        },
        async createGoal(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(DurableGoalRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid durable goal');
            const existing = goalStore.get(ctx.tenantId, parsed.goalId);
            if (existing) {
                if (existing.objective === parsed.objective && existing.conversationId === parsed.conversationId) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Goal ID conflict.', 409);
            }
            return { status: 'created', record: goalStore.set(ctx.tenantId, parsed.goalId, parsed) };
        },
        async getGoal(goalId, context) {
            const ctx = validateContext(context);
            return goalStore.get(ctx.tenantId, goalId);
        },
        async reviseGoal(goalId, patch, expectedRevision, context) {
            const ctx = validateContext(context);
            const existing = goalStore.get(ctx.tenantId, goalId);
            if (!existing) throw new ModelDomainError('NOT_FOUND', 'Goal not found.', 404);
            if (existing.revision !== expectedRevision) {
                throw new ModelDomainError('STALE_REVISION', 'Stale goal revision.', 409);
            }
            const next = parseSchema(DurableGoalRecordSchema, {
                ...existing,
                ...patch,
                goalId,
                tenantId: ctx.tenantId,
                revision: existing.revision + 1,
            });
            return { status: 'updated', record: goalStore.set(ctx.tenantId, goalId, next) };
        },
        async listGoals(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query);
            return paginateItems(goalStore.list(ctx.tenantId), q, 'goalId');
        },
    };
}
