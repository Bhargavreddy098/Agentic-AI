import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

const SafeCronExpressionSchema = z.string().min(3).max(128).refine(
    val => /^[A-Za-z0-9*/,\-_:\s]+$/.test(val) && !/(?:eval|Function|import|require|;|\(|\))/i.test(val),
    'Schedule expression must not contain executable code'
);

export const ScheduleSpecSchema = z.object({
    scheduleId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    owningConversationId: OpaqueIdSchema,
    goalRef: OpaqueIdSchema,
    timezone: z.string().min(1).max(64).default('UTC'),
    scheduleExpression: SafeCronExpressionSchema,
    missedRunPolicy: z.enum(['skip', 'run_once']).default('skip'),
    overlapPolicy: z.enum(['skip', 'queue_one']).default('skip'),
    notificationIntent: z.string().min(1).max(256).default('notify_conversation'),
    version: PositiveIntSchema.default(1),
    budgetRef: OpaqueIdSchema,
    grantRef: OpaqueIdSchema,
});

export const ScheduleRecordSchema = ScheduleSpecSchema.extend({
    nextRunAt: IsoTimestampSchema,
    lastRunRef: OpaqueIdSchema.nullable().default(null),
    enabled: z.boolean().default(true),
    policyDecisionRef: OpaqueIdSchema.default('pol-schedule-approved'),
});
