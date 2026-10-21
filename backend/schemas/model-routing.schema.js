import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, NonNegativeIntSchema } from './_shared.js';

export const QualifiedCandidateModelSchema = z.object({
    modelRef: OpaqueIdSchema,
    privacyTier: z.enum(['local_only', 'zero_retention', 'standard']),
    policyApproved: z.boolean().default(true),
    qualityScore: z.number().min(0).max(1),
    costMicroUsdPer1k: NonNegativeIntSchema,
    latencyMsP95: PositiveIntSchema,
});

export const ModelRoutingRequestSchema = z.object({
    taskClass: z.string().min(1).max(64),
    requiredPrivacyTier: z.enum(['local_only', 'zero_retention', 'standard']).default('zero_retention'),
    qualifiedCandidateModelRefs: z.array(QualifiedCandidateModelSchema).min(1).max(32),
    scoringPolicyVersion: z.string().min(1).max(32).default('v1'),
    policyDecisionRef: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    allowFallback: z.boolean().default(false),
});

export const ModelRoutingDecisionSchema = z.object({
    selectedModelRef: OpaqueIdSchema.nullable(),
    privacyEligibility: z.enum(['eligible', 'rejected_by_privacy']),
    scoreBasis: z.number().nullable(),
    policyDecisionRef: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    reason: z.string().min(1).max(256),
});
