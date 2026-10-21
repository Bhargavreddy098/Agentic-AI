import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, ScopeEnumSchema } from './_shared.js';

export const ConsolidationCandidateSchema = z.object({
    candidateId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    sourceMemoryRefs: z.array(OpaqueIdSchema).min(1).max(64),
    sourceEpisodeRefs: z.array(OpaqueIdSchema).max(64).default([]),
    candidateDigest: DigestSchema,
    evalReportRef: OpaqueIdSchema,
    expectedMemoryVersions: z.record(OpaqueIdSchema, PositiveIntSchema),
    scope: ScopeEnumSchema.default('Global'),
    publishedFact: z.literal(false).default(false),
});
