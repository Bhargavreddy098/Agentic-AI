import { z } from "zod";
import {
  FutureUtcTimestampSchema,
  MicroUsdSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
} from "./primitives.js";

export * from "./primitives.js";
export * from "./identity.js";
export * from "./session.js";
export * from "./task.js";
export * from "./effect.js";
export * from "./model.js";
export * from "./tool.js";
export * from "./memory.js";
export * from "./audit.js";
export * from "./delivery.js";

export const CandidateSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  candidateId: OpaqueIdSchema,
  parentCandidateId: OpaqueIdSchema.optional(),
  artifactHash: Sha256HexSchema,
  allowedChangedPaths: z.array(z.string().min(1).max(4096)).min(1).max(256),
  schemaDigests: z.array(Sha256HexSchema).min(1).max(256),
  policyDigests: z.array(Sha256HexSchema).min(1).max(256),
  requestedPermissions: z.array(OpaqueIdSchema).min(1).max(128),
  status: z.enum([
    "pending",
    "evaluating",
    "approved",
    "rejected",
    "promoted",
    "rolled_back",
  ]),
});

export type Candidate = z.infer<typeof CandidateSchema>;

export const EvalReportSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  candidateId: OpaqueIdSchema,
  evaluatorVersion: OpaqueIdSchema,
  caseSetDigests: z.array(Sha256HexSchema).min(1).max(1024),
  scores: z.record(z.string(), z.number().min(0).max(1)),
  costMicroUsd: MicroUsdSchema,
  latencyMs: z.number().int().min(0),
  governanceFailures: z.array(OpaqueIdSchema).max(256),
  signedEvidenceRefs: z.array(OpaqueIdSchema).min(1).max(256),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;

export const PromotionDecisionSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  candidateHash: Sha256HexSchema,
  artifactHash: Sha256HexSchema,
  reportHash: Sha256HexSchema,
  policyVersion: OpaqueIdSchema,
  approverIds: z.array(OpaqueIdSchema).min(1).max(64),
  expiresAt: FutureUtcTimestampSchema,
  decision: z.enum(["promote", "reject", "defer"]),
});

export type PromotionDecision = z.infer<typeof PromotionDecisionSchema>;

declare const traceHandleBrand: unique symbol;

export type TraceHandle = {
  readonly [traceHandleBrand]: true;
};
