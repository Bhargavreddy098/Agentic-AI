import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

export const AgentVersionManifestSchema = z.object({
    versionId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    promptDigest: DigestSchema,
    configDigest: DigestSchema,
    modelPolicyDigest: DigestSchema,
    skillsDigest: DigestSchema,
    toolsDigest: DigestSchema,
    permissionPolicyDigest: DigestSchema,
    memoryPolicyDigest: DigestSchema,
    evalSetDigest: DigestSchema,
    compatibilityVersion: z.string().min(1).max(32).default('v2'),
    previousVersionRef: OpaqueIdSchema.nullable().default(null),
    signerRef: OpaqueIdSchema,
});
