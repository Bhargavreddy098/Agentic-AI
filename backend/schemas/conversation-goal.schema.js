import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const DurableConversationRecordSchema = z.object({
    conversationId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    title: z.string().min(1).max(256).default('New conversation'),
    pinned: z.boolean().default(false),
    archived: z.boolean().default(false),
    revision: PositiveIntSchema.default(1),
    updatedAt: IsoTimestampSchema.optional(),
});

export const DurableGoalRecordSchema = z.object({
    goalId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    conversationId: OpaqueIdSchema,
    objective: z.string().min(1).max(2048),
    status: z.enum(['active', 'completed', 'blocked', 'cancelled']).default('active'),
    revision: PositiveIntSchema.default(1),
    verified: z.boolean().default(false),
});
