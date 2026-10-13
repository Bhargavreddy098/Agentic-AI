import { z } from "zod";
import { OpaqueIdSchema, BoundedTextSchema } from "./primitives.js";

export const EvidenceSchemaVersionSchema = z.literal(1);

export const ConfidenceBasisSchema = z.enum(["measured", "heuristic", "unassessed"]);

export const EvidenceClaimSchema = z.strictObject({
  schemaVersion: EvidenceSchemaVersionSchema,
  claimId: OpaqueIdSchema,
  text: BoundedTextSchema,
  sourceRefs: z.array(OpaqueIdSchema).min(1).max(64),
  observedAt: z.iso.datetime({ offset: false }),
  verifiedAt: z.iso.datetime({ offset: false }).optional(),
  confidenceBasis: ConfidenceBasisSchema,
  contradictionRefs: z.array(OpaqueIdSchema).max(64).default([]),
});

export type EvidenceClaim = z.infer<typeof EvidenceClaimSchema>;

export const CriterionResultSchema = z.strictObject({
  criterionId: OpaqueIdSchema,
  satisfied: z.boolean().nullable(),
  evidenceRefs: z.array(OpaqueIdSchema).max(64).default([]),
  safeReason: z.string().min(1).max(1024),
});

export type CriterionResult = z.infer<typeof CriterionResultSchema>;

export const VerificationReportSchema = z.strictObject({
  schemaVersion: EvidenceSchemaVersionSchema,
  reportId: OpaqueIdSchema,
  goalId: OpaqueIdSchema,
  goalRevision: z.number().int().min(1),
  planDigest: z.strictObject({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  artifactDigests: z.array(z.strictObject({
    algorithm: z.literal("sha256"),
    value: z.string().regex(/^[a-f0-9]{64}$/),
  })).max(256).default([]),
  criterionResults: z.array(CriterionResultSchema).min(1).max(32),
  verifierId: OpaqueIdSchema,
  verifierVersion: OpaqueIdSchema,
  checkedAt: z.iso.datetime({ offset: false }),
});

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

export const VerificationReportDigestSchema = z.strictObject({
  algorithm: z.literal("sha256"),
  value: z.string().regex(/^[a-f0-9]{64}$/),
});

export type VerificationReportDigest = z.infer<typeof VerificationReportDigestSchema>;

export function computeVerificationReportDigest(report: Omit<VerificationReport, "reportId">): VerificationReportDigest {
  const canonical = JSON.stringify(report, Object.keys(report).sort());
  const hash = new TextEncoder().encode(canonical);
  return { algorithm: "sha256", value: Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("") };
}