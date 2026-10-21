import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const BrowserTaskProfileSchema = z.object({
    startingUrl: z.string().url(),
    allowedDomainRefs: z.array(z.string().min(1).max(128)).min(1).max(32),
    sessionProfileRef: OpaqueIdSchema,
    permittedActionRefs: z.array(OpaqueIdSchema).min(1).max(32),
    approvalRefs: z.array(OpaqueIdSchema).max(16).default([]),
});

export const DataTaskProfileSchema = z.object({
    connectionHandleRef: OpaqueIdSchema,
    permittedSchemaRefs: z.array(OpaqueIdSchema).min(1).max(16),
    queryArtifactRef: OpaqueIdSchema,
    readOnly: z.literal(true).default(true),
    maxRows: PositiveIntSchema.max(100000).default(1000),
    maxBytes: PositiveIntSchema.max(52428800).default(1048576),
    timeoutMs: PositiveIntSchema.max(60000).default(5000),
});

export const CodingTaskProfileSchema = z.object({
    repositoryRef: OpaqueIdSchema,
    baseCommit: z.string().min(7).max(64).regex(/^[0-9a-fA-F]+$/),
    assignedPaths: z.array(z.string().min(1).max(256).refine(p => !p.includes('..'))).min(1).max(64),
    allowedCommands: z.array(z.string().min(1).max(128)).min(1).max(16),
    branchRef: OpaqueIdSchema,
    acceptanceTestRefs: z.array(OpaqueIdSchema).min(1).max(32),
    reviewPolicyRef: OpaqueIdSchema,
});

export const ResearchTaskProfileSchema = z.object({
    question: z.string().min(1).max(1024),
    hypothesisRefs: z.array(OpaqueIdSchema).max(16).default([]),
    permittedSourceRefs: z.array(OpaqueIdSchema).min(1).max(32),
    maxQueries: PositiveIntSchema.max(25).default(5),
    claimCriteriaRefs: z.array(OpaqueIdSchema).min(1).max(16),
    graphMode: z.enum(['disabled', 'scoped']).default('disabled'),
});

export const SpecialistTaskProfileSchema = z.object({
    taskId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    profileType: z.enum(['browser', 'data', 'coding', 'research']),
    goalRef: OpaqueIdSchema,
    profileDigest: DigestSchema,
    deadlineAt: IsoTimestampSchema,
    version: PositiveIntSchema.default(1),
    browserConfig: BrowserTaskProfileSchema.optional(),
    dataConfig: DataTaskProfileSchema.optional(),
    codingConfig: CodingTaskProfileSchema.optional(),
    researchConfig: ResearchTaskProfileSchema.optional(),
});
