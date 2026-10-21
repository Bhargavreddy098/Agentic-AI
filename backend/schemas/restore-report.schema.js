import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, IsoTimestampSchema } from './_shared.js';

export const RestoreReportSchema = z.object({
    restoreId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    backupArtifactRef: OpaqueIdSchema,
    backupDigest: DigestSchema,
    targetEnvironmentRef: OpaqueIdSchema,
    retentionPolicyRef: OpaqueIdSchema,
    verificationRefs: z.array(OpaqueIdSchema).min(1).max(32),
    limitations: z.array(z.string().min(1).max(512)).min(1).max(32),
    validatedAt: IsoTimestampSchema.optional(),
});
