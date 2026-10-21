import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, IsoTimestampSchema } from './_shared.js';

export const DecisionSummarySchema = z.object({
    decisionId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    receiptRef: OpaqueIdSchema,
    receiptHash: DigestSchema,
    actionSummary: z.string().min(1).max(512),
    targetSummary: z.string().min(1).max(512),
    evidenceRefs: z.array(OpaqueIdSchema).max(32).default([]),
    policyVersion: z.string().min(1).max(64),
    modelVersionRef: OpaqueIdSchema.nullable().default(null),
    toolVersionRef: OpaqueIdSchema.nullable().default(null),
    occurredAt: IsoTimestampSchema,
    uncertainty: z.enum(['none', 'low', 'medium', 'high', 'unknown']).default('none'),
    redactionVersion: z.string().min(1).max(32).default('v1'),
});
