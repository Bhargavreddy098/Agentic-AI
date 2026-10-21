import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

export const ToolCandidateRecordSchema = z.object({
    candidateId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    manifestDigest: DigestSchema,
    artifactDigest: DigestSchema,
    evalReportRefs: z.array(OpaqueIdSchema).min(1).max(32),
    versionRef: OpaqueIdSchema,
    reviewState: z.enum(['staged', 'review_required', 'approved', 'rejected']).default('staged'),
});
