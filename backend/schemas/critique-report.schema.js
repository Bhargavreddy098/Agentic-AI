import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, UsageRecordSchema } from './_shared.js';

export const CritiqueFindingSchema = z.object({
    claimId: OpaqueIdSchema,
    category: z.enum(['unsupported', 'conflict', 'error', 'missing_evidence']),
    evidenceRefs: z.array(OpaqueIdSchema).max(16).default([]),
    safeSummary: z.string().min(1).max(1024),
});

export const CritiqueReportSchema = z.object({
    reportId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    goalId: OpaqueIdSchema,
    goalRevision: PositiveIntSchema,
    taskResultRef: OpaqueIdSchema,
    criticId: OpaqueIdSchema,
    criticVersion: z.string().min(1).max(64),
    round: z.number().int().min(1).max(2),
    findings: z.array(CritiqueFindingSchema).max(32),
    suggestedPlanRevision: PositiveIntSchema.optional(),
    usage: UsageRecordSchema.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 }),
});
