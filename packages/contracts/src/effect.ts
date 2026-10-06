import { z } from "zod";
import { RunContextSchema } from "./task.js";
import {
  FutureUtcTimestampSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  Sha256HexSchema,
} from "./primitives.js";
import { PrincipalSchema } from "./identity.js";

export const EffectStatusSchema = z.enum([
  "planned",
  "authorized",
  "executing",
  "succeeded",
  "failed",
  "unknown",
]);

export const EffectRequestSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  effectId: OpaqueIdSchema,
  action: OpaqueIdSchema,
  resource: OpaqueIdSchema,
  inputHash: Sha256HexSchema,
  artifactHash: Sha256HexSchema.optional(),
  runContext: RunContextSchema,
  idempotencyKey: OpaqueIdSchema,
  traceId: OpaqueIdSchema,
});

export type EffectRequest = z.infer<typeof EffectRequestSchema>;

export const PolicyDecisionSchema = z.discriminatedUnion("decision", [
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    decisionId: OpaqueIdSchema,
    policyVersion: OpaqueIdSchema,
    decision: z.literal("allow"),
    boundCapability: OpaqueIdSchema,
    boundExpiresAt: FutureUtcTimestampSchema,
    reason: z.never().optional(),
  }),
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    decisionId: OpaqueIdSchema,
    policyVersion: OpaqueIdSchema,
    decision: z.literal("deny"),
    boundCapability: z.never().optional(),
    boundExpiresAt: z.never().optional(),
    reason: z.string().min(1).max(1024),
  }),
  z.strictObject({
    schemaVersion: SchemaVersionSchema,
    decisionId: OpaqueIdSchema,
    policyVersion: OpaqueIdSchema,
    decision: z.literal("approval_required"),
    boundCapability: z.never().optional(),
    boundExpiresAt: z.never().optional(),
    reason: z.string().min(1).max(1024),
  }),
]);

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const ApprovalRecordSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  approvalId: OpaqueIdSchema,
  approver: PrincipalSchema,
  effectId: OpaqueIdSchema,
  inputHash: Sha256HexSchema,
  policyVersion: OpaqueIdSchema,
  expiresAt: FutureUtcTimestampSchema,
  nonce: OpaqueIdSchema,
});

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
