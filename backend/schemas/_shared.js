import { z } from 'zod';

export const OpaqueIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/);
export const DigestSchema = z.string().min(7).max(160).regex(/^(?:sha256:)?[A-Fa-f0-9]{16,128}$/);
export const IsoTimestampSchema = z.string().min(10).max(64).refine(val => !Number.isNaN(Date.parse(val)), 'Invalid ISO timestamp');
export const PositiveIntSchema = z.number().int().min(1);
export const NonNegativeIntSchema = z.number().int().min(0);
export const BoundedLimitSchema = z.coerce.number().int().min(1).max(100).default(25);
export const CursorSchema = z.string().min(1).max(256).optional();
export const ScopeEnumSchema = z.enum(['Global', 'Role', 'Private']);

export const TenantContextSchema = z.object({
    tenantId: OpaqueIdSchema,
    principalId: OpaqueIdSchema.optional(),
    agentId: OpaqueIdSchema.nullable().optional(),
    roleIds: z.array(OpaqueIdSchema).max(100).default([]),
    requestedScopes: z.array(ScopeEnumSchema).min(1).max(3).default(['Global']),
    now: IsoTimestampSchema.optional(),
    commandId: OpaqueIdSchema.optional(),
});

export const ListQuerySchema = z.object({
    limit: BoundedLimitSchema,
    cursor: CursorSchema,
    status: z.string().max(64).optional(),
});

export const UsageRecordSchema = z.object({
    promptTokens: NonNegativeIntSchema.default(0),
    completionTokens: NonNegativeIntSchema.default(0),
    totalTokens: NonNegativeIntSchema.default(0),
    costMicroUsd: NonNegativeIntSchema.default(0),
});
