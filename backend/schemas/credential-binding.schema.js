import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, IsoTimestampSchema } from './_shared.js';

export const CredentialResolutionSchema = z.object({
    bindingId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    handleId: OpaqueIdSchema,
    verifiedEffectRef: OpaqueIdSchema,
    executionBindingRef: OpaqueIdSchema,
    allowedTargetDigest: DigestSchema,
    expiresAt: IsoTimestampSchema,
    revokedAt: IsoTimestampSchema.nullable().default(null),
});
