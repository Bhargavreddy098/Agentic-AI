import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, ScopeEnumSchema } from './_shared.js';

export const ArtifactCandidateSchema = z.object({
    artifactId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    owningConversationId: OpaqueIdSchema,
    runId: OpaqueIdSchema,
    sha256: DigestSchema,
    trustedStoreDigest: DigestSchema.optional(),
    mediaType: z.string().min(3).max(128),
    byteSize: PositiveIntSchema.max(104857600),
    contentRef: OpaqueIdSchema,
    producerVersionRef: OpaqueIdSchema.default('producer-v1'),
    sourceEvidenceRefs: z.array(OpaqueIdSchema).max(32).default([]),
    validationReportRef: OpaqueIdSchema.nullable().default(null),
    visibilityScope: ScopeEnumSchema.default('Private'),
    published: z.literal(false).default(false),
});
