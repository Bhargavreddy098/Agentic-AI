import { ProjectRecordSchema } from '../schemas/project.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

function assertProjectCompletionValid(project) {
    if (project.status === 'completed') {
        const requiredGoals = project.goalRefs.filter(g => g.required);
        if (requiredGoals.length === 0 || requiredGoals.some(g => !g.verified)) {
            throw new ModelDomainError('CONFLICT', 'Project completion requires all required goals to be verified.', 409);
        }
    }
}

export function createProjectModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createProject(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(ProjectRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid project record');
            assertProjectCompletionValid(parsed);
            const existing = store.get(ctx.tenantId, parsed.projectId);
            if (existing) {
                if (existing.conversationId === parsed.conversationId && existing.version === parsed.version) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Project ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.projectId, parsed) };
        },
        async getProject(projectId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, projectId);
        },
        async reviseProject(input, expectedVersion, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.projectId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale project version.', 409);
            }
            const next = parseSchema(ProjectRecordSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                version: existing.version + 1,
            }, 'Invalid project revision');
            assertProjectCompletionValid(next);
            return { status: 'updated', record: store.set(ctx.tenantId, next.projectId, next) };
        },
        async listProjects(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid project list query');
            const items = store.list(ctx.tenantId, item => !q.status || item.status === q.status);
            return paginateItems(items, q, 'projectId');
        },
    };
}
