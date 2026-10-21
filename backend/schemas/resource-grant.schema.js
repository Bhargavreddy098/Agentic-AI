import { z } from 'zod';
import { OpaqueIdSchema, IsoTimestampSchema, NonNegativeIntSchema } from './_shared.js';

export const ResourceGrantRequestSchema = z.object({
    grantId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    parentGrantId: OpaqueIdSchema.nullable().default(null),
    audience: OpaqueIdSchema,
    capabilities: z.array(z.string().min(1).max(128)).min(1).max(64),
    delegationDepth: NonNegativeIntSchema.max(5).default(0),
    expiresAt: IsoTimestampSchema,
    revokedAt: IsoTimestampSchema.nullable().default(null),
});
