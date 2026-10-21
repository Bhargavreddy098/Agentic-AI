import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema, ScopeEnumSchema, BoundedLimitSchema, CursorSchema } from './_shared.js';

export const ObservationSchema = z.object({
    observationId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    entity: OpaqueIdSchema,
    relation: z.string().min(1).max(128),
    value: z.string().min(1).max(2048),
    scope: ScopeEnumSchema.default('Global'),
    roleId: OpaqueIdSchema.nullable().default(null),
    ownerAgentId: OpaqueIdSchema.nullable().default(null),
    sourceRefs: z.array(OpaqueIdSchema).min(1).max(32).default(['src-default']),
    revision: PositiveIntSchema.default(1),
    validUntil: IsoTimestampSchema.nullable().default(null),
});

export const GraphQuerySchema = z.object({
    permittedScopeRefs: z.array(ScopeEnumSchema).min(1).max(3).default(['Global']),
    entityRefs: z.array(OpaqueIdSchema).min(1).max(32),
    relationTypes: z.array(z.string().min(1).max(128)).max(32).optional(),
    maxDepth: z.number().int().min(1).max(2).default(1),
    limit: BoundedLimitSchema,
    cursor: CursorSchema,
});

export const GraphResultSchema = z.object({
    observations: z.array(ObservationSchema),
    nextCursor: z.string().nullable(),
});
