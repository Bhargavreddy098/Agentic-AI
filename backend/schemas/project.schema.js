import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema } from './_shared.js';

export const ProjectGoalStatusSchema = z.object({
    goalId: OpaqueIdSchema,
    required: z.boolean().default(true),
    verified: z.boolean().default(false),
});

export const ProjectRecordSchema = z.object({
    projectId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    conversationId: OpaqueIdSchema,
    title: z.string().min(1).max(256).default('Untitled Project'),
    version: PositiveIntSchema.default(1),
    status: z.enum(['active', 'paused', 'blocked', 'completed', 'cancelled']).default('active'),
    goalRefs: z.array(ProjectGoalStatusSchema).default([]),
    planRefs: z.array(OpaqueIdSchema).default([]),
    artifactRefs: z.array(OpaqueIdSchema).default([]),
    blockerRefs: z.array(OpaqueIdSchema).default([]),
    budgetRef: OpaqueIdSchema.optional(),
    grantRef: OpaqueIdSchema.optional(),
});
