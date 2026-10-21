import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, NonNegativeIntSchema } from './_shared.js';

export const ContextSourceCandidateSchema = z.object({
    sourceRef: OpaqueIdSchema,
    tokenCount: PositiveIntSchema,
    toolGroupRef: OpaqueIdSchema.nullable().default(null),
    authorized: z.boolean().default(true),
    trustLabel: z.enum(['trusted_system', 'untrusted_data']).default('untrusted_data'),
});

export const ContextCompileRequestSchema = z.object({
    permittedSourceRefs: z.array(ContextSourceCandidateSchema).min(1).max(128),
    goalRef: OpaqueIdSchema.optional(),
    taskType: z.string().min(1).max(64),
    maxContextTokens: PositiveIntSchema.max(256000),
    stablePrefixRef: OpaqueIdSchema,
    stablePrefixTokens: NonNegativeIntSchema.default(256),
    requiredToolGroupRefs: z.array(OpaqueIdSchema).max(32).default([]),
});

export const ContextBundleSchema = z.object({
    orderedSourceRefs: z.array(OpaqueIdSchema),
    compiledArtifactRef: OpaqueIdSchema,
    prefixHash: DigestSchema,
    tokenCount: NonNegativeIntSchema,
    omittedRefs: z.array(z.object({
        sourceRef: OpaqueIdSchema,
        reason: z.enum(['token_budget_exceeded', 'incomplete_tool_group', 'unauthorized']),
    })),
    trustLabels: z.record(OpaqueIdSchema, z.enum(['trusted_system', 'untrusted_data'])),
});
