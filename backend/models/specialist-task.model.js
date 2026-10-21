import { SpecialistTaskProfileSchema } from '../schemas/specialist-task.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createSpecialistTaskModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createTaskProfile(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(SpecialistTaskProfileSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid specialist task profile');
            if (parsed.profileType === 'browser' && !parsed.browserConfig) {
                throw new ModelDomainError('INVALID_INPUT', 'Browser specialist task requires browserConfig with allowedDomainRefs.', 400);
            }
            if (parsed.profileType === 'data' && !parsed.dataConfig) {
                throw new ModelDomainError('INVALID_INPUT', 'Data specialist task requires dataConfig with readOnly=true and row/byte/time limits.', 400);
            }
            if (parsed.profileType === 'coding' && !parsed.codingConfig) {
                throw new ModelDomainError('INVALID_INPUT', 'Coding specialist task requires codingConfig with assignedPaths and baseCommit.', 400);
            }
            if (parsed.profileType === 'research' && !parsed.researchConfig) {
                throw new ModelDomainError('INVALID_INPUT', 'Research specialist task requires researchConfig with maxQueries and permittedSourceRefs.', 400);
            }
            const existing = store.get(ctx.tenantId, parsed.taskId);
            if (existing) {
                if (existing.profileDigest === parsed.profileDigest) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Specialist task ID conflict.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.taskId, parsed) };
        },
        async getTaskProfile(taskId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, taskId);
        },
        async listTaskProfiles(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid specialist task list query');
            return paginateItems(store.list(ctx.tenantId), q, 'taskId');
        },
    };
}
