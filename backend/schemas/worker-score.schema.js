import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, NonNegativeIntSchema, IsoTimestampSchema } from './_shared.js';

export const WorkerScoreSchema = z.object({
    workerId: OpaqueIdSchema,
    metricVersion: z.string().min(1).max(32).default('v1'),
    sampleCount: PositiveIntSchema,
    qualityScore: z.number().min(0).max(1),
    latencyMsP95: NonNegativeIntSchema,
    costMicroUsdAvg: NonNegativeIntSchema,
    violationCount: NonNegativeIntSchema.default(0),
    healthy: z.boolean().default(true),
    hasCurrentGrant: z.boolean().default(true),
    hasCapacity: z.boolean().default(true),
    policyAllowed: z.boolean().default(true),
    evidenceRefs: z.array(OpaqueIdSchema).min(1).max(32),
    measuredAt: IsoTimestampSchema,
    validUntil: IsoTimestampSchema,
});

export const RankedWorkerSchema = z.object({
    workerId: OpaqueIdSchema,
    eligibility: z.enum(['eligible', 'ineligible']),
    ineligibleReason: z.string().nullable().default(null),
    scoreBasis: z.number(),
    deterministicRank: PositiveIntSchema,
});
