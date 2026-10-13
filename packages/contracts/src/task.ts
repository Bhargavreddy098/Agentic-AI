import { z } from "zod";
import { PrincipalSchema } from "./identity.js";
import {
  ArtifactReferenceSchema,
  BoundedTextSchema,
  boundedJsonObjectSchema,
  ErrorCodeSchema,
  FutureUtcTimestampSchema,
  MicroUsdSchema,
  ModeSchema,
  OpaqueIdSchema,
  SchemaVersionSchema,
  TokenCountSchema,
} from "./primitives.js";

export const BudgetRefSchema = z.strictObject({
  tenantId: OpaqueIdSchema,
  accountId: OpaqueIdSchema,
  rootRunId: OpaqueIdSchema,
});

export type BudgetRef = z.infer<typeof BudgetRefSchema>;

export const BudgetReservationSchema = z.strictObject({
  reservationId: OpaqueIdSchema,
  budgetRef: BudgetRefSchema,
  reservedTokens: TokenCountSchema,
  reservedCostMicroUsd: MicroUsdSchema,
  status: z.enum(["reserved", "settled", "unknown"]),
});

export type BudgetReservation = z.infer<typeof BudgetReservationSchema>;

export const RunContextSchema = z.strictObject({
  runId: OpaqueIdSchema,
  sessionId: OpaqueIdSchema,
  writerEpoch: z.number().int().min(1),
  mode: ModeSchema,
  deadlineAt: FutureUtcTimestampSchema,
  budgetRef: BudgetRefSchema,
  parentRunId: OpaqueIdSchema.optional(),
  goalRef: OpaqueIdSchema.optional(),
  projectRef: OpaqueIdSchema.optional(),
  verificationRef: OpaqueIdSchema.optional(),
});

export type RunContext = z.infer<typeof RunContextSchema>;

export const UsageSchema = z.strictObject({
  inputTokens: TokenCountSchema,
  outputTokens: TokenCountSchema,
});

export type Usage = z.infer<typeof UsageSchema>;

export const NormalizedErrorSchema = z.strictObject({
  code: ErrorCodeSchema,
  safeMessage: z.string().min(1).max(1024),
  retryable: z.boolean(),
  detailsRef: OpaqueIdSchema.optional(),
});

export type NormalizedError = z.infer<typeof NormalizedErrorSchema>;

export const RunStatusSchema = z.enum([
  "accepted",
  "queued",
  "running",
  "waiting_approval",
  "suspended",
  "finalizing",
  "completed",
  "cancelled",
  "failed",
  "budget_exhausted",
]);

export const TaskStatusSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
  "budget_exhausted",
  "unknown",
]);

const TaskResultBase = {
  schemaVersion: SchemaVersionSchema,
  taskId: OpaqueIdSchema,
  runId: OpaqueIdSchema,
  traceId: OpaqueIdSchema,
  usage: UsageSchema,
  evidenceRefs: z.array(ArtifactReferenceSchema).max(64),
  goalRef: OpaqueIdSchema.optional(),
  projectRef: OpaqueIdSchema.optional(),
  verificationRef: OpaqueIdSchema.optional(),
} as const;

export const TaskResultSchema = z.discriminatedUnion("status", [
  z.strictObject({
    ...TaskResultBase,
    status: z.literal("completed"),
    output: boundedJsonObjectSchema(1048576),
    error: z.never().optional(),
  }),
  z.strictObject({
    ...TaskResultBase,
    status: z.literal("failed"),
    output: z.never().optional(),
    error: NormalizedErrorSchema,
  }),
  z.strictObject({
    ...TaskResultBase,
    status: z.literal("cancelled"),
    output: z.never().optional(),
    error: NormalizedErrorSchema,
  }),
  z.strictObject({
    ...TaskResultBase,
    status: z.literal("budget_exhausted"),
    output: z.never().optional(),
    error: NormalizedErrorSchema,
  }),
  z.strictObject({
    ...TaskResultBase,
    status: z.literal("unknown"),
    output: z.never().optional(),
    error: z.never().optional(),
  }),
]);

export type TaskResult = z.infer<typeof TaskResultSchema>;

export const TaskEnvelopeSchema = z.strictObject({
  schemaVersion: SchemaVersionSchema,
  taskId: OpaqueIdSchema,
  traceId: OpaqueIdSchema,
  correlationId: OpaqueIdSchema,
  causationId: OpaqueIdSchema,
  runContext: RunContextSchema,
  requiredCapabilities: z.array(OpaqueIdSchema).min(1).max(128),
  input: boundedJsonObjectSchema(1048576),
  principalGrant: PrincipalSchema,
  idempotencyKey: OpaqueIdSchema,
  goalRef: OpaqueIdSchema.optional(),
  projectRef: OpaqueIdSchema.optional(),
  verificationRef: OpaqueIdSchema.optional(),
}).refine(task => task.principalGrant.tenantId === task.runContext.budgetRef.tenantId, {
  message: "delegated principal and root budget must share a tenant",
  path: ["principalGrant", "tenantId"],
});

export type TaskEnvelope = z.infer<typeof TaskEnvelopeSchema>;

export const CheckpointSchema = z.strictObject({
  checkpointId: OpaqueIdSchema,
  runContext: RunContextSchema,
  state: BoundedTextSchema,
  completedTaskIds: z.array(OpaqueIdSchema).max(1024),
  completedEffectIds: z.array(OpaqueIdSchema).max(1024),
  modelResultRefs: z.array(OpaqueIdSchema).max(1024),
  version: z.number().int().min(1),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const WorkerDescriptorSchema = z.strictObject({
  workerId: OpaqueIdSchema,
  capabilities: z.array(OpaqueIdSchema).min(1).max(128),
  health: z.enum(["healthy", "degraded", "unavailable"]),
  capacity: z
    .strictObject({
      active: z.number().int().min(0),
      max: z.number().int().min(1),
    })
    .superRefine((capacity, ctx) => {
      if (capacity.active > capacity.max) {
        ctx.addIssue({
          code: "custom",
          message: "active capacity must not exceed max capacity",
        });
      }
    }),
  supportedTaskTypes: z.array(OpaqueIdSchema).min(1).max(128),
});

export type WorkerDescriptor = z.infer<typeof WorkerDescriptorSchema>;
