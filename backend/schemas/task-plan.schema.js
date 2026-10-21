import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema } from './_shared.js';

export const PlanStepSchema = z.object({
    stepId: OpaqueIdSchema,
    title: z.string().min(1).max(256),
    dependsOn: z.array(OpaqueIdSchema).max(32).default([]),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'blocked', 'unknown']).default('pending'),
});

export const TaskPlanSchema = z.object({
    planId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    goalId: OpaqueIdSchema,
    goalRevision: PositiveIntSchema,
    revision: PositiveIntSchema.default(1),
    planDigest: DigestSchema,
    maxParallelism: z.number().int().min(1).max(8).default(4),
    steps: z.array(PlanStepSchema).min(1).max(64),
});
