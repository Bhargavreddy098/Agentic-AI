import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, NonNegativeIntSchema } from './_shared.js';

export const RecoveryInputSchema = z.object({
    failedTaskRef: OpaqueIdSchema,
    normalizedError: z.enum(['TRANSIENT_FAILURE', 'UNKNOWN_EXTERNAL_OUTCOME', 'POLICY_DENIED', 'QUOTA_EXCEEDED', 'VALIDATION_FAILED']),
    receiptRef: OpaqueIdSchema.nullable().optional(),
    currentPlanRef: OpaqueIdSchema,
    attemptsAlreadyUsed: NonNegativeIntSchema,
    maxAllowedAttempts: PositiveIntSchema.max(5).default(3),
    approvedAlternativeRefs: z.array(OpaqueIdSchema).max(16).default([]),
});

export const RecoveryPlanSchema = z.object({
    decision: z.enum(['retry', 'reconcile', 'replan', 'stop']),
    reasonCode: z.string().min(1).max(128),
    approvedAlternativeRefs: z.array(OpaqueIdSchema),
    nextPlanRevision: PositiveIntSchema.optional(),
    maxRemainingAttempts: NonNegativeIntSchema,
});
