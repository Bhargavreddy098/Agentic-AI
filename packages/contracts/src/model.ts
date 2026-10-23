import { z } from "zod/v4";
import {
  BudgetReservationSchema,
  RunContextSchema,
  UsageSchema,
} from "./task.js";
import {
  ArtifactReferenceSchema,
  BoundedTextSchema,
  MicroUsdSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  SensitivitySchema,
} from "./primitives.js";

export const PromptPartSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), text: BoundedTextSchema }),
]);

export const ModelRequestSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  modelClass: OpaqueIdSchema,
  promptParts: z.array(PromptPartSchema).min(1).max(256),
  stablePrefix: BoundedTextSchema,
  sensitivity: SensitivitySchema,
  maxOutputTokens: z.number().int().min(1).max(1048576),
  runContext: RunContextSchema,
  budgetReservation: BudgetReservationSchema,
  traceId: OpaqueIdSchema,
});

export type ModelRequest = z.infer<typeof ModelRequestSchema>;

export const ModelResultSchema = z.strictObject({
  resultId: OpaqueIdSchema,
  outputRefs: z.array(ArtifactReferenceSchema).max(64),
  usageTokens: UsageSchema,
  costMicroUsd: MicroUsdSchema,
  providerModelRevision: OpaqueIdSchema,
  finishReason: OpaqueIdSchema,
});

export type ModelResult = z.infer<typeof ModelResultSchema>;
