import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

export const AgentReleaseReportSchema = z.object({
    releaseId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    candidateManifestRef: OpaqueIdSchema,
    immutableEvalReportRefs: z.array(OpaqueIdSchema).min(1).max(32),
    protectedBaselineDigest: DigestSchema,
    gateVersion: z.string().min(1).max(32),
    targetEnvironmentRef: OpaqueIdSchema,
    promotionApprovalRef: OpaqueIdSchema,
    decision: z.enum(['eligible', 'denied']),
    canaryPlanRef: OpaqueIdSchema,
    rollbackPlanRef: OpaqueIdSchema,
    deployed: z.literal(false).default(false),
});
