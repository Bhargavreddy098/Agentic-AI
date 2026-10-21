import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, IsoTimestampSchema } from './_shared.js';

export const CompensationPlanSchema = z.object({
    planId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    originalReceiptRef: OpaqueIdSchema,
    observedStateRef: OpaqueIdSchema,
    supportedActionRefs: z.array(OpaqueIdSchema).max(32).default([]),
    irreversibleOutcomes: z.array(z.string().min(1).max(512)).max(32).default([]),
    requiredApprovalRef: OpaqueIdSchema,
    expectedStateDigest: DigestSchema,
    boundedDeadline: IsoTimestampSchema,
});
