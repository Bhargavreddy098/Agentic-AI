import { z } from 'zod';
import { OpaqueIdSchema, UsageRecordSchema } from './_shared.js';

export const DebateReportSchema = z.object({
    debateId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    proposalVersionRef: OpaqueIdSchema,
    budgetRef: OpaqueIdSchema,
    roleRefs: z.array(OpaqueIdSchema).min(2).max(4),
    rounds: z.number().int().min(1).max(2),
    delegatedTasksUsed: z.number().int().min(0).max(8).default(2),
    modelIterationsUsed: z.number().int().min(0).max(12).default(4),
    contributions: z.array(z.object({
        roleRef: OpaqueIdSchema,
        round: z.number().int().min(1).max(2),
        summary: z.string().min(1).max(1024),
        evidenceRefs: z.array(OpaqueIdSchema).max(16).default([]),
    })).min(1).max(16),
    disagreements: z.array(z.string().min(1).max(512)).max(16).default([]),
    recommendations: z.array(z.string().min(1).max(512)).max(16).default([]),
    usage: UsageRecordSchema.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 }),
});
