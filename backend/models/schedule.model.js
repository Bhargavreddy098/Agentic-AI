import { ScheduleRecordSchema } from '../schemas/schedule.schema.js';
import { ListQuerySchema } from '../schemas/_shared.js';
import { ModelDomainError, validateContext, assertSameTenant, parseSchema, paginateItems, createScopedStore } from './_shared.js';

function assertValidTimezone(tz) {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
        throw new ModelDomainError('INVALID_INPUT', `Invalid IANA timezone '${tz}'.`, 400);
    }
}

export function createScheduleModel(options = {}) {
    const store = createScopedStore(options.store);

    return {
        async createSchedule(input, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const parsed = parseSchema(ScheduleRecordSchema, { ...input, tenantId: ctx.tenantId }, 'Invalid schedule record');
            assertValidTimezone(parsed.timezone);
            const existing = store.get(ctx.tenantId, parsed.scheduleId);
            if (existing) {
                if (existing.scheduleExpression === parsed.scheduleExpression && existing.goalRef === parsed.goalRef) {
                    return { status: 'same_existing', record: existing };
                }
                throw new ModelDomainError('CONFLICT', 'Schedule ID already exists with different parameters.', 409);
            }
            return { status: 'created', record: store.set(ctx.tenantId, parsed.scheduleId, parsed) };
        },
        async getSchedule(scheduleId, context) {
            const ctx = validateContext(context);
            return store.get(ctx.tenantId, scheduleId);
        },
        async reviseSchedule(input, expectedVersion, context) {
            const ctx = assertSameTenant(input?.tenantId, context);
            const existing = store.get(ctx.tenantId, input?.scheduleId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale schedule version.', 409);
            }
            const next = parseSchema(ScheduleRecordSchema, {
                ...existing,
                ...input,
                tenantId: ctx.tenantId,
                version: existing.version + 1,
            }, 'Invalid schedule revision');
            assertValidTimezone(next.timezone);
            return { status: 'updated', record: store.set(ctx.tenantId, next.scheduleId, next) };
        },
        async disableSchedule(scheduleId, expectedVersion, context) {
            const ctx = validateContext(context);
            const existing = store.get(ctx.tenantId, scheduleId);
            if (!existing) return { status: 'not_found', record: null };
            if (existing.version !== expectedVersion) {
                throw new ModelDomainError('STALE_REVISION', 'Stale schedule version on disable.', 409);
            }
            const next = { ...existing, enabled: false, version: existing.version + 1 };
            return { status: 'updated', record: store.set(ctx.tenantId, scheduleId, next) };
        },
        async listSchedules(query = {}, context) {
            const ctx = validateContext(context);
            const q = parseSchema(ListQuerySchema, query, 'Invalid schedule list query');
            return paginateItems(store.list(ctx.tenantId), q, 'scheduleId');
        },
    };
}
