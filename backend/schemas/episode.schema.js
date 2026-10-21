import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, NonNegativeIntSchema, BoundedLimitSchema, CursorSchema, IsoTimestampSchema } from './_shared.js';

export const EpisodeAppendInputSchema = z.object({
    episodeId: OpaqueIdSchema,
    sessionId: OpaqueIdSchema,
    conversationId: OpaqueIdSchema,
    sequence: NonNegativeIntSchema,
    role: z.enum(['user', 'assistant', 'tool', 'system']),
    content: z.string().min(1).max(32768),
    payloadDigest: DigestSchema,
    occurredAt: IsoTimestampSchema,
});

export const EpisodeSearchQuerySchema = z.object({
    sessionId: OpaqueIdSchema.optional(),
    conversationId: OpaqueIdSchema.optional(),
    query: z.string().max(512).default(''),
    limit: BoundedLimitSchema,
    cursor: CursorSchema,
});

export const EpisodeCompressionLineageSchema = z.object({
    lineageId: OpaqueIdSchema,
    sessionId: OpaqueIdSchema,
    sourceEpisodeIds: z.array(OpaqueIdSchema).min(1).max(100),
    summaryDigest: DigestSchema,
    createdAt: IsoTimestampSchema,
});
