import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, UsageRecordSchema } from './_shared.js';

export const GovernedGenerateInputSchema = z.object({
    requestId: OpaqueIdSchema,
    modelRef: OpaqueIdSchema,
    taskClass: z.string().min(1).max(64).default('general'),
    privacyTier: z.enum(['local_only', 'zero_retention', 'standard']).default('zero_retention'),
    policyDecisionRef: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    prompt: z.string().min(1).max(32768),
    maxOutputTokens: PositiveIntSchema.max(16384).default(1024),
});

export const GovernedEmbedInputSchema = z.object({
    requestId: OpaqueIdSchema,
    modelRef: OpaqueIdSchema,
    policyDecisionRef: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    text: z.string().min(1).max(16384),
    dimensions: z.literal(1536).default(1536),
});

export const UsageReconciliationInputSchema = z.object({
    requestId: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    status: z.enum(['settled', 'unknown_usage', 'cancelled']),
    usage: UsageRecordSchema,
});
