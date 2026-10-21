import { FleetAssignmentRecordSchema } from '../schemas/fleet-assignment.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

export function createFleetAssignmentModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createAssignment(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(FleetAssignmentRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid fleet assignment');
            if (parsed.parentStatus !== 'active') {
                throw new ModelDomainError('POLICY_DENIED', 'Cancelled or expired parent run denies fleet assignment.', 409);
            }
            const existingById = store.get(ctx.tenantId, parsed.assignmentId);
            if (existingById) {
                if (existingById.taskRef === parsed.taskRef && existingById.agentVersionRef === parsed.agentVersionRef) {
                    return { status: 'same_existing', record: existingById };
                }
                throw new ModelDomainError('CONFLICT', 'Fleet assignment ID conflict.', 409);
            }
            const duplicateActive = store.list(
                ctx.tenantId,
                item => item.status === 'active' && item.taskRef === parsed.taskRef && item.agentVersionRef === parsed.agentVersionRef
            );
            if (duplicateActive.length > 0) {
                throw new ModelDomainError('CONFLICT', 'Only one active scoped assignment per taskRef + agentVersionRef is allowed.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.assignmentId, parsed) };
        },
        async getAssignment(assignmentId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, assignmentId);
        },
        async reviseAssignment(input, expectedVersion, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.assignmentId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale fleet assignment revision.', 409);
            }
            if ((input.parentStatus ?? existing.parentStatus) !== 'active' && input.status === 'active') {
                throw new ModelDomainError('POLICY_DENIED', 'Cancelled or expired parent denies reassignment.', 409);
            }
            const updated = parseSchema(FleetAssignmentRecordSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                version: existing.version + 1,
            }, 'Invalid fleet assignment revision');
            return { status: 'updated', record: store.set(ctx.tenantId, updated.assignmentId, updated) };
        },
        async listAssignments(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid fleet assignment list query');
            const items = store.list(ctx.tenantId, item => !q.status || item.status === q.status);
            return paginateItems(items, q, 'assignmentId');
        },
    };
}
