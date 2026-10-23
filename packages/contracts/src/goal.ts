import { z } from "zod/v4";
import { OpaqueIdSchema, FutureUtcTimestampSchema, BoundedTextSchema } from "./primitives.js";
import { BudgetRefSchema } from "./task.js";

export const GoalSchemaVersionSchema = z.literal(1);

export const GoalSpecSchema = z.strictObject({
  schemaVersion: GoalSchemaVersionSchema,
  goalId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  conversationId: OpaqueIdSchema,
  objective: z.string().min(1).max(8192),
  criteria: z.array(z.strictObject({
    criterionId: OpaqueIdSchema,
    description: z.string().min(1).max(2048),
    evaluatorId: OpaqueIdSchema,
    evidenceRequirement: z.enum(["artifact", "test", "source", "human"]),
    required: z.boolean(),
  })).min(1).max(32),
  constraintRefs: z.array(OpaqueIdSchema).max(64).default([]),
  allowedResourceRefs: z.array(OpaqueIdSchema).max(64).default([]),
  deadlineAt: FutureUtcTimestampSchema,
  budgetRef: BudgetRefSchema,
  revision: z.number().int().min(1).default(1),
});

export type GoalSpec = z.infer<typeof GoalSpecSchema>;

export const GoalStatusSchema = z.enum([
  "draft",
  "ready",
  "running",
  "waiting_input",
  "waiting_approval",
  "suspended",
  "verified",
  "unmet",
  "cancelled",
  "failed",
]);

export const GoalRecordSchema = GoalSpecSchema.extend({
  status: GoalStatusSchema,
  owningRunId: OpaqueIdSchema.optional(),
  latestVerificationRef: OpaqueIdSchema.optional(),
});

export type GoalRecord = z.infer<typeof GoalRecordSchema>;

export const GoalRevisionSchema = z.strictObject({
  schemaVersion: GoalSchemaVersionSchema,
  goalId: OpaqueIdSchema,
  revision: z.number().int().min(1),
  previousRevision: z.number().int().min(0).optional(),
  changedAt: z.iso.datetime({ offset: false }),
  changedBy: OpaqueIdSchema,
  diff: BoundedTextSchema,
});

export type GoalRevision = z.infer<typeof GoalRevisionSchema>;