import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema, ScopeEnumSchema } from './_shared.js';

export const MemoryLifecycleRevisionSchema = z.object({
    memoryId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    expectedMemoryVersion: PositiveIntSchema,
    version: PositiveIntSchema.default(1),
    value: z.string().min(1).max(4096).default('memory-value'),
    scope: ScopeEnumSchema.default('Global'),
    roleId: OpaqueIdSchema.nullable().default(null),
    ownerAgentId: OpaqueIdSchema.nullable().default(null),
    numericConfidence: z.number().min(0).max(1).default(0.9),
    confidenceBasis: z.enum(['verified_user_correction', 'observed_evidence', 'inferred_consolidation']),
    sourceRefs: z.array(OpaqueIdSchema).min(1).max(32),
    contradictionRefs: z.array(OpaqueIdSchema).max(32).default([]),
    proposedValueRef: OpaqueIdSchema.nullable().default(null),
    createdAt: IsoTimestampSchema,
    verifiedAt: IsoTimestampSchema.nullable().default(null),
    expiresAt: IsoTimestampSchema.nullable().default(null),
});
