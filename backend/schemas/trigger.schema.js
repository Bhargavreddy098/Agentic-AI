import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const TriggerEventSchema = z.object({
    schemaVersion: PositiveIntSchema.default(1),
    eventId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    sourceId: OpaqueIdSchema,
    externalEventId: OpaqueIdSchema,
    occurredAt: IsoTimestampSchema,
    receivedAt: IsoTimestampSchema,
    payloadRef: OpaqueIdSchema,
    observedDigest: DigestSchema,
    signatureVerificationRef: OpaqueIdSchema,
});

export const TriggerAcceptanceSchema = z.object({
    acceptedId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    sourceId: OpaqueIdSchema,
    externalEventId: OpaqueIdSchema,
    observedDigest: DigestSchema,
    signatureVerificationRef: OpaqueIdSchema,
    duplicate: z.boolean().default(false),
    scheduledRunRef: OpaqueIdSchema.nullable().default(null),
    status: z.enum(['accepted', 'rejected', 'rate_limited']).default('accepted'),
});
