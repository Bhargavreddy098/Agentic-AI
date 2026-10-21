import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, NonNegativeIntSchema } from './_shared.js';

export const WorkAllocationItemSchema = z.object({
    workRef: OpaqueIdSchema,
    reservedTokens: NonNegativeIntSchema.max(10000000),
    reservedCostMicroUsd: NonNegativeIntSchema.max(1000000000),
});

export const BudgetAllocationPlanSchema = z.object({
    allocationId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    budgetRef: OpaqueIdSchema,
    version: PositiveIntSchema.default(1),
    parentQuotaTokens: PositiveIntSchema.max(100000000).default(1000000),
    parentQuotaMicroUsd: PositiveIntSchema.max(1000000000).default(50000000),
    allocations: z.array(WorkAllocationItemSchema).min(1).max(32),
    unknownUsageRefs: z.array(OpaqueIdSchema).max(32).default([]),
    totalReserved: z.object({
        tokens: NonNegativeIntSchema,
        costMicroUsd: NonNegativeIntSchema,
    }),
});
