import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, UsageRecordSchema } from './_shared.js';

export const CandidateComparisonRequestSchema = z.object({
    comparisonId: OpaqueIdSchema,
    goalRef: OpaqueIdSchema,
    planRef: OpaqueIdSchema,
    candidateRefs: z.array(OpaqueIdSchema).min(2).max(4),
    evaluatorVersionRef: OpaqueIdSchema,
    budgetRef: OpaqueIdSchema,
    budgetLimitTokens: PositiveIntSchema.default(32000),
    noLiveWrites: z.literal(true),
});

export const CandidateComparisonSchema = z.object({
    comparisonId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    goalRef: OpaqueIdSchema,
    planRef: OpaqueIdSchema,
    candidateRefs: z.array(OpaqueIdSchema).min(2).max(4),
    evaluatorVersionRef: OpaqueIdSchema,
    winnerRef: OpaqueIdSchema.nullable().default(null),
    budgetRef: OpaqueIdSchema,
    noLiveWrites: z.literal(true).default(true),
    criterionResults: z.array(z.object({
        criterionId: OpaqueIdSchema,
        candidateRef: OpaqueIdSchema,
        passed: z.boolean(),
        score: z.number().min(0).max(1),
    })).default([]),
    disagreementSummary: z.string().max(1024).default(''),
    evidenceRefs: z.array(OpaqueIdSchema).max(32).default([]),
    usage: UsageRecordSchema.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 }),
});
