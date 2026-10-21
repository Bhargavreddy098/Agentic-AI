import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema, PositiveIntSchema, NonNegativeIntSchema } from './_shared.js';

export const SkillCandidateEntrySchema = z.object({
    skillId: OpaqueIdSchema,
    version: z.string().min(1).max(64),
    manifestDigest: DigestSchema,
    instructionRef: OpaqueIdSchema,
    tokenCount: PositiveIntSchema,
    verified: z.boolean().default(true),
    revoked: z.boolean().default(false),
    authorized: z.boolean().default(true),
});

export const SkillSelectionRequestSchema = z.object({
    taskType: z.string().min(1).max(64),
    availableSkillRefs: z.array(SkillCandidateEntrySchema).max(100),
    requestedSkillRefs: z.array(OpaqueIdSchema).max(32).default([]),
    maxContextTokens: PositiveIntSchema.max(128000),
    grantRef: OpaqueIdSchema,
});

export const QualifiedSkillSelectionSchema = z.object({
    selectedSkills: z.array(z.object({
        skillId: OpaqueIdSchema,
        version: z.string().min(1).max(64),
        manifestDigest: DigestSchema,
    })),
    selectedInstructionRefs: z.array(OpaqueIdSchema),
    omittedReasons: z.array(z.object({
        skillId: OpaqueIdSchema,
        reason: z.enum(['unverified', 'revoked', 'unauthorized', 'token_budget_exceeded', 'not_requested']),
    })),
    tokenCount: NonNegativeIntSchema,
});
