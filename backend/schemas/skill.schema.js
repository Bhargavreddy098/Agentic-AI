import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, BoundedLimitSchema, CursorSchema } from './_shared.js';

export const SkillCatalogEntrySchema = z.object({
    skillId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    publisherId: OpaqueIdSchema,
    manifestDigest: DigestSchema,
    signatureVerified: z.boolean().default(true),
    revocationState: z.enum(['active', 'revoked']).default('active'),
    requestedCapabilityRefs: z.array(OpaqueIdSchema).max(32).default([]),
    catalogRevision: PositiveIntSchema.default(1),
});

export const SkillInstallRequestSchema = z.object({
    skillId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    publisherId: OpaqueIdSchema,
    manifestDigest: DigestSchema,
    requestedCapabilityRefs: z.array(OpaqueIdSchema).max(32).default([]),
    catalogEntryRef: OpaqueIdSchema,
    expectedCatalogRevision: PositiveIntSchema,
    policyDecisionRef: OpaqueIdSchema,
    evalReportRef: OpaqueIdSchema.optional(),
});

export const SkillInstallProposalSchema = z.object({
    proposalId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    skillId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    publisherId: OpaqueIdSchema,
    manifestDigest: DigestSchema,
    requestedCapabilityRefs: z.array(OpaqueIdSchema).max(32).default([]),
    catalogEntryRef: OpaqueIdSchema,
    expectedCatalogRevision: PositiveIntSchema,
    policyDecisionRef: OpaqueIdSchema,
    reviewState: z.enum(['pending', 'approved', 'rejected']).default('pending'),
    evalReportRef: OpaqueIdSchema.optional(),
    revocationState: z.enum(['active', 'revoked']).default('active'),
});

export const SkillCatalogQuerySchema = z.object({
    limit: BoundedLimitSchema,
    cursor: CursorSchema,
});
