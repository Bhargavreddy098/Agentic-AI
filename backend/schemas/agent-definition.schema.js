import { z } from 'zod';
import { OpaqueIdSchema, DigestSchema } from './_shared.js';

export const AgentDefinitionCandidateSchema = z.object({
    definitionId: OpaqueIdSchema,
    roleId: OpaqueIdSchema,
    promptArtifactDigest: DigestSchema,
    modelPolicyRef: OpaqueIdSchema,
    skillVersionRefs: z.array(OpaqueIdSchema).max(32).default([]),
    toolManifestRefs: z.array(OpaqueIdSchema).max(32).default([]),
    requestedCapabilityRefs: z.array(OpaqueIdSchema).max(32).default([]),
    memoryPolicyRef: OpaqueIdSchema,
    evalSetRef: OpaqueIdSchema,
});

export const AgentDefinitionProposalSchema = z.object({
    proposalId: OpaqueIdSchema,
    tenantId: OpaqueIdSchema.optional(),
    definitionId: OpaqueIdSchema,
    candidateDigest: DigestSchema,
    versionRef: OpaqueIdSchema,
    evalReportRef: OpaqueIdSchema,
    policyDecisionRef: OpaqueIdSchema,
    lifecycle: z.enum(['staged', 'denied', 'review_required']).default('staged'),
});
