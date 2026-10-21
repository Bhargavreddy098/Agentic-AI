import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, NonNegativeIntSchema, IsoTimestampSchema } from './_shared.js';

export const ActionPreviewSchema = z.object({
    previewId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    effectId: OpaqueIdSchema,
    inputHash: DigestSchema,
    artifactHash: DigestSchema.nullable().default(null),
    simulationReportRef: OpaqueIdSchema.nullable().default(null),
    assumptions: z.array(z.string().min(1).max(512)).max(32).default([]),
    proposedChangesRef: OpaqueIdSchema,
    estimatedCostMicroUsd: NonNegativeIntSchema.nullable().default(null),
    risks: z.array(z.string().min(1).max(512)).max(32).default([]),
    expiresAt: IsoTimestampSchema,
    version: PositiveIntSchema.default(1),
});
