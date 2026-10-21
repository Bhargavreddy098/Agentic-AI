import { z } from 'zod';
import { OpaqueIdSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const AgentLifecycleStateSchema = z.enum(['active', 'suspended', 'stopped', 'revoked', 'failed']);

export const AgentLifecycleResultSchema = z.object({
    agentId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    definitionVersionRef: OpaqueIdSchema,
    owningRunId: OpaqueIdSchema.nullable().default(null),
    checkpointRef: OpaqueIdSchema.nullable().default(null),
    lifecycle: AgentLifecycleStateSchema.default('active'),
    lastTransitionAt: IsoTimestampSchema,
    currentGrantRef: OpaqueIdSchema.nullable().default(null),
    nextScheduleRef: OpaqueIdSchema.nullable().default(null),
    version: PositiveIntSchema.default(1),
});

export const AgentLifecycleTransitionInputSchema = z.object({
    agentId: OpaqueIdSchema,
    expectedVersion: PositiveIntSchema,
    targetLifecycle: AgentLifecycleStateSchema,
    currentGrantRef: OpaqueIdSchema.nullable().optional(),
    checkpointRef: OpaqueIdSchema.nullable().optional(),
    owningRunId: OpaqueIdSchema.nullable().optional(),
    transitionAt: IsoTimestampSchema.optional(),
});
