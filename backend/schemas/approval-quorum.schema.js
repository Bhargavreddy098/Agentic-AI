import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, IsoTimestampSchema } from './_shared.js';

export const ApprovalQuorumRequestSchema = z.object({
    quorumId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    effectRef: OpaqueIdSchema,
    inputHash: DigestSchema,
    artifactHash: DigestSchema.nullable().default(null),
    policyVersion: z.string().min(1).max(64),
    proposalVersion: PositiveIntSchema.default(1),
    requiredActorRoles: z.array(OpaqueIdSchema).min(1).max(16),
    quorumCount: PositiveIntSchema.max(16),
    expiresAt: IsoTimestampSchema,
    nonceRef: OpaqueIdSchema,
});

export const ApprovalActorVoteSchema = z.object({
    quorumId: OpaqueIdSchema,
    actorId: OpaqueIdSchema,
    actorRole: OpaqueIdSchema,
    decision: z.enum(['approve', 'deny']),
    effectRef: OpaqueIdSchema,
    inputHash: DigestSchema,
    proposalVersion: PositiveIntSchema,
    decidedAt: IsoTimestampSchema.optional(),
});

export const ApprovalQuorumDecisionSchema = z.object({
    quorumId: OpaqueIdSchema,
    status: z.enum(['pending', 'allowed', 'denied', 'expired']),
    decisionRefs: z.array(OpaqueIdSchema),
    proposalVersion: PositiveIntSchema,
    inputHash: DigestSchema,
    epoch: PositiveIntSchema.default(1),
});
