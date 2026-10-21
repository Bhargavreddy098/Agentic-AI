import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

const CanonicalSafePathSchema = z.string().min(1).max(256).refine(
    val => !val.includes('..') && !val.includes('\\') && !val.includes('//'),
    'Workspace path must be canonical and must not escape assigned root'
);

export const WorkspaceRequestSchema = z.object({
    workspaceId: OpaqueIdSchema,
    agentDefinitionRef: OpaqueIdSchema,
    assignedPathRefs: z.array(CanonicalSafePathSchema).min(1).max(32),
    readOnlyMountRefs: z.array(CanonicalSafePathSchema).max(32).default([]),
    allowedDomains: z.array(z.string().min(1).max(128)).max(32).default([]),
    byteQuota: PositiveIntSchema.max(10737418240).default(104857600),
    expiresAt: IsoTimestampSchema,
    retentionPolicyRef: OpaqueIdSchema,
});

export const WorkspaceLeaseSchema = z.object({
    leaseId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    workspaceId: OpaqueIdSchema,
    rootRef: OpaqueIdSchema,
    assignedPathRefs: z.array(CanonicalSafePathSchema).min(1).max(32).default(['workspace/main']),
    profileDigest: DigestSchema,
    expiresAt: IsoTimestampSchema,
    cleanupState: z.enum(['active', 'expired', 'cleaned']).default('active'),
    version: PositiveIntSchema.default(1),
});
