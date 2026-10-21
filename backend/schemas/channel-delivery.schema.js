import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const ChannelBindingRecordSchema = z.object({
    bindingId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    channelType: z.enum(['web', 'cli', 'slack', 'whatsapp', 'discord']),
    externalAccountRef: OpaqueIdSchema,
    externalConversationRef: OpaqueIdSchema,
    credentialHandleRef: OpaqueIdSchema,
    version: PositiveIntSchema.default(1),
    createdAt: IsoTimestampSchema.optional(),
});

export const ChannelDeliveryRecordSchema = z.object({
    deliveryId: OpaqueIdSchema,
    bindingId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    conversationId: OpaqueIdSchema,
    payloadDigest: z.string().min(7).max(160),
    status: z.enum(['queued', 'delivered', 'failed', 'unknown']).default('queued'),
    version: PositiveIntSchema.default(1),
});
