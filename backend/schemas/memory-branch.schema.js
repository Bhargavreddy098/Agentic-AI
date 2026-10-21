import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema, ScopeEnumSchema, BoundedLimitSchema, CursorSchema } from './_shared.js';

export const MemoryBranchRecordSchema = z.object({
    branchId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    parentBranchId: OpaqueIdSchema.nullable().default(null),
    version: PositiveIntSchema.default(1),
    expiresAt: IsoTimestampSchema,
    grantRefs: z.array(OpaqueIdSchema).min(1).max(16),
    visibilityScope: ScopeEnumSchema.default('Private'),
    memoryRefs: z.array(OpaqueIdSchema).max(100).default([]),
});

export const MemoryBranchQuerySchema = z.object({
    branchId: OpaqueIdSchema,
    requestedScopeRefs: z.array(ScopeEnumSchema).min(1).max(3),
    queryRef: OpaqueIdSchema,
    expectedBranchVersion: PositiveIntSchema,
    limit: BoundedLimitSchema,
    cursor: CursorSchema,
});

export const MemoryBranchResultSchema = z.object({
    ancestry: z.array(OpaqueIdSchema),
    matchingMemoryRefs: z.array(OpaqueIdSchema),
    versions: z.record(OpaqueIdSchema, PositiveIntSchema),
    nextCursor: z.string().nullable(),
});
