import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema } from './_shared.js';

export const RemoteTaskStatusSchema = z.enum([
    'submitted',
    'working',
    'input-required',
    'completed',
    'failed',
    'canceled',
    'unknown',
]);

export const RemoteTaskRecordSchema = z.object({
    remoteTaskId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    localTaskId: OpaqueIdSchema,
    remoteAgentRef: OpaqueIdSchema,
    protocolRevision: z.string().min(1).max(32).default('1.0.0'),
    status: RemoteTaskStatusSchema.default('submitted'),
    version: PositiveIntSchema.default(1),
    resultDigest: DigestSchema.nullable().default(null),
});

export const RemoteTaskTransitionInputSchema = z.object({
    remoteTaskId: OpaqueIdSchema,
    expectedVersion: PositiveIntSchema,
    nextStatus: RemoteTaskStatusSchema,
    resultDigest: DigestSchema.nullable().optional(),
});
