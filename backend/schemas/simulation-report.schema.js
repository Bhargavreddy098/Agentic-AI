import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, NonNegativeIntSchema, UsageRecordSchema } from './_shared.js';

export const SimulationReportSchema = z.object({
    simulationId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    candidateVersionRef: OpaqueIdSchema,
    scenarioSetRef: OpaqueIdSchema,
    heldOutVersionRef: OpaqueIdSchema,
    environmentDigest: DigestSchema,
    inputDigest: DigestSchema.default('sha256:0000000000000000'),
    candidateDigest: DigestSchema.default('sha256:1111111111111111'),
    evalDigest: DigestSchema.default('sha256:2222222222222222'),
    fixedBudgetRef: OpaqueIdSchema,
    noLiveEffects: z.literal(true),
    governanceViolations: NonNegativeIntSchema.default(0),
    scenarioResults: z.array(z.object({
        scenarioId: OpaqueIdSchema,
        passed: z.boolean(),
        score: z.number().min(0).max(1),
    })).min(1).max(64),
    limitations: z.array(z.string().min(1).max(512)).min(1).max(32),
    usage: UsageRecordSchema.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 }),
});
