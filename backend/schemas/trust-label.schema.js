import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

export const UntrustedInputSchema = z.object({
    inputRef: OpaqueIdSchema,
    origin: z.enum(['web', 'tool', 'memory', 'episode', 'skill', 'remote']),
    observedDigest: DigestSchema,
    contentRef: OpaqueIdSchema,
    suspiciousPatterns: z.array(z.string().min(1).max(128)).max(16).default([]),
});

export const TrustLabelledInputSchema = z.object({
    inputRef: OpaqueIdSchema,
    origin: z.enum(['web', 'tool', 'memory', 'episode', 'skill', 'remote']),
    observedDigest: DigestSchema,
    contentRef: OpaqueIdSchema,
    instructionTrust: z.literal('untrusted_data'),
    flags: z.array(z.string().min(1).max(128)),
    quarantineRef: OpaqueIdSchema.nullable().default(null),
});
