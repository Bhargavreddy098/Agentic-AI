import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const FleetAssignmentRecordSchema = z.object({
    assignmentId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    taskRef: OpaqueIdSchema,
    agentVersionRef: OpaqueIdSchema,
    grantRef: OpaqueIdSchema,
    budgetRef: OpaqueIdSchema,
    deadlineAt: IsoTimestampSchema,
    status: z.enum(['active', 'completed', 'cancelled', 'expired']).default('active'),
    parentStatus: z.enum(['active', 'cancelled', 'expired']).default('active'),
    version: PositiveIntSchema.default(1),
});
