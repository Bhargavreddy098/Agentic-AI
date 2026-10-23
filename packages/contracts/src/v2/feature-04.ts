import { z } from "zod/v4";
import { OpaqueIdSchema, Sha256HexSchema, BoundedTextSchema } from "../primitives.js";
import { ConfidenceBasisSchema, EvidenceClaimSchema } from "../evidence.js";

export const Feature04SchemaVersionSchema = z.literal(1);

export const EvidenceSourceKindSchema = z.enum(["artifact", "test", "source", "human"]);

export type EvidenceSourceKind = z.infer<typeof EvidenceSourceKindSchema>;

export const EvidenceSourceSchema = z.strictObject({
  sourceRef: OpaqueIdSchema,
  kind: EvidenceSourceKindSchema,
  observedAt: z.iso.datetime({ offset: false }),
  contentHash: Sha256HexSchema.optional(),
  supersedes: z.array(OpaqueIdSchema).max(64).default([]),
  contradicts: z.array(OpaqueIdSchema).max(64).default([]),
});

export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const BoundEvidenceClaimSchema = EvidenceClaimSchema.extend({
  criterionRefs: z.array(OpaqueIdSchema).max(32).default([]),
});

export type BoundEvidenceClaim = z.infer<typeof BoundEvidenceClaimSchema>;

export const ClaimTraceStatusSchema = z.enum([
  "supported",
  "unsupported",
  "conflicting",
  "stale",
  "unknown",
]);

export type ClaimTraceStatus = z.infer<typeof ClaimTraceStatusSchema>;

export const ClaimTraceSchema = z.strictObject({
  claimId: OpaqueIdSchema,
  status: ClaimTraceStatusSchema,
  supportingSourceRefs: z.array(OpaqueIdSchema).max(64),
  conflictingSourceRefs: z.array(OpaqueIdSchema).max(64),
  staleSourceRefs: z.array(OpaqueIdSchema).max(64),
  safeReason: z.string().min(1).max(1024),
});

export type ClaimTrace = z.infer<typeof ClaimTraceSchema>;

export const ArtifactProvenanceSchema = z.strictObject({
  schemaVersion: Feature04SchemaVersionSchema,
  provenanceId: OpaqueIdSchema,
  artifactId: OpaqueIdSchema,
  contentHash: Sha256HexSchema,
  mediaType: z.string().min(1).max(128),
  authorId: OpaqueIdSchema,
  authorVersion: OpaqueIdSchema,
  sourceRefs: z.array(OpaqueIdSchema).min(1).max(64),
  claimRefs: z.array(OpaqueIdSchema).max(64).default([]),
  observedAt: z.iso.datetime({ offset: false }),
  verifiedAt: z.iso.datetime({ offset: false }).optional(),
  confidenceBasis: ConfidenceBasisSchema,
  createdAt: z.iso.datetime({ offset: false }),
});

export type ArtifactProvenance = z.infer<typeof ArtifactProvenanceSchema>;

export const ArtifactProvenanceDigestSchema = z.strictObject({
  algorithm: z.literal("sha256"),
  value: Sha256HexSchema,
});

export type ArtifactProvenanceDigest = z.infer<typeof ArtifactProvenanceDigestSchema>;

export const VerificationOutcomeSchema = z.enum(["verified", "unmet", "unknown"]);

export type VerificationOutcome = z.infer<typeof VerificationOutcomeSchema>;

export const EvidenceBackedOutputSchema = z.strictObject({
  schemaVersion: Feature04SchemaVersionSchema,
  outputId: OpaqueIdSchema,
  goalId: OpaqueIdSchema,
  goalRevision: z.number().int().min(1),
  reportId: OpaqueIdSchema,
  outcome: VerificationOutcomeSchema,
  claims: z.array(BoundEvidenceClaimSchema).max(256),
  provenance: z.array(ArtifactProvenanceSchema).max(256),
  limitations: z.array(BoundedTextSchema).max(64),
});

export type EvidenceBackedOutput = z.infer<typeof EvidenceBackedOutputSchema>;
