import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, NonNegativeIntSchema, BoundedLimitSchema, UsageRecordSchema } from './_shared.js';

export const ReplayQuerySchema = z.object({
    runId: OpaqueIdSchema,
    fromSequence: NonNegativeIntSchema.default(0),
    toSequence: NonNegativeIntSchema.default(100),
    limit: BoundedLimitSchema,
    mode: z.literal('read_only').default('read_only'),
});

export const ReplayEntrySchema = z.object({
    sequence: NonNegativeIntSchema,
    kind: z.enum(['checkpoint', 'observation', 'effect_result']),
    refId: OpaqueIdSchema,
    sourceDigest: DigestSchema,
    outcome: z.enum(['completed', 'failed', 'unknown']).default('completed'),
});

export const ReplayViewSchema = z.object({
    runId: OpaqueIdSchema,
    fromSequence: NonNegativeIntSchema,
    toSequence: NonNegativeIntSchema,
    limit: BoundedLimitSchema,
    mode: z.literal('read_only'),
    entries: z.array(ReplayEntrySchema),
    unknownOutcomeRefs: z.array(OpaqueIdSchema).default([]),
    usage: UsageRecordSchema.default({ promptTokens: 0, completionTokens: 0, totalTokens: 0, costMicroUsd: 0 }),
});
