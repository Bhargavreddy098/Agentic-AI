import { z } from 'zod';
import { OpaqueIdSchema, IsoTimestampSchema } from './_shared.js';

export const SwarmPlanSchema = z.object({
    swarmPlanId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    goalRef: OpaqueIdSchema,
    planRef: OpaqueIdSchema,
    reviewedAllocationRef: OpaqueIdSchema,
    sharedBudgetRef: OpaqueIdSchema,
    requestedDepth: z.number().int().min(1).max(2),
    requestedFanOut: z.number().int().min(1).max(8),
    chiefAgentVersionRef: OpaqueIdSchema,
    workerAssignments: z.array(z.object({
        workerId: OpaqueIdSchema,
        agentVersionRef: OpaqueIdSchema,
        reducedGrantRef: OpaqueIdSchema,
        unrestrictedPeerGrant: z.literal(false).default(false),
        deadlineAt: IsoTimestampSchema,
    })).min(1).max(8),
    dispatched: z.literal(false).default(false),
});
