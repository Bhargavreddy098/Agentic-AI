import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const ToolManifestRegistrationSchema = z.object({
    toolId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    manifestDigest: DigestSchema,
    signatureVerified: z.boolean().default(true),
    sideEffectClass: z.enum(['read_only', 'bounded_write', 'external_network']).default('read_only'),
    requiresApproval: z.boolean().default(false),
});

export const ToolExecutionRequestSchema = z.object({
    executionId: OpaqueIdSchema,
    toolId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    inputDigest: DigestSchema,
    leaseEpoch: PositiveIntSchema,
    grantRef: OpaqueIdSchema,
    policyDecisionRef: OpaqueIdSchema,
    budgetReservationRef: OpaqueIdSchema,
    audience: OpaqueIdSchema,
    expiresAt: IsoTimestampSchema,
    sandboxQualified: z.boolean().default(false),
    arguments: z.record(z.string(), z.unknown()).default({}),
});
