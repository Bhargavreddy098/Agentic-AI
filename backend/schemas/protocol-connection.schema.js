import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const ProtocolConnectionRecordSchema = z.object({
    connectionId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    protocolRevision: z.string().min(1).max(64).default('2026-07-28'),
    endpointRef: OpaqueIdSchema,
    credentialHandleRef: OpaqueIdSchema,
    capabilityDigest: DigestSchema,
    policyApproved: z.boolean().default(true),
    version: PositiveIntSchema.default(1),
    expiresAt: IsoTimestampSchema,
});
