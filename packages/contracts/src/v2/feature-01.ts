import { z } from "zod/v4";
import { OpaqueIdSchema, UtcTimestampSchema } from "../primitives.js";
import { GoalStatusSchema } from "../goal.js";

export const Feature01SchemaVersionSchema = z.literal(1);

// A measurable success metric is a reviewed GoalSpec criterion observed over time.
// The threshold/comparator belongs to the criterion's named evaluator, which stays
// outside the agent; the agent only records per-criterion satisfaction and evidence.
export const GoalMetricObservationSchema = z.strictObject({
  metricId: OpaqueIdSchema,
  criterionId: OpaqueIdSchema,
  description: z.string().min(1).max(2048),
  evaluatorId: OpaqueIdSchema,
  required: z.boolean(),
  satisfied: z.boolean().nullable(),
  evidenceRefs: z.array(OpaqueIdSchema).max(64).default([]),
  safeReason: z.string().min(1).max(1024),
});

export type GoalMetricObservation = z.infer<typeof GoalMetricObservationSchema>;

export const GoalProgressDisplaySchema = z.enum([
  "achieved",
  "on_track",
  "unmet",
  "unknown",
]);

export type GoalProgressDisplay = z.infer<typeof GoalProgressDisplaySchema>;

export const GoalProgressReportSchema = z.strictObject({
  schemaVersion: Feature01SchemaVersionSchema,
  progressId: OpaqueIdSchema,
  goalId: OpaqueIdSchema,
  goalRevision: z.number().int().min(1),
  status: GoalStatusSchema,
  displayStatus: GoalProgressDisplaySchema,
  measuredAt: UtcTimestampSchema,
  metrics: z.array(GoalMetricObservationSchema).min(1).max(32),
  verificationRef: OpaqueIdSchema.optional(),
  limitations: z.array(z.string().min(1).max(1024)).max(32).default([]),
});

export type GoalProgressReport = z.infer<typeof GoalProgressReportSchema>;

export const GoalTransitionSchema = z.strictObject({
  schemaVersion: Feature01SchemaVersionSchema,
  transitionId: OpaqueIdSchema,
  goalId: OpaqueIdSchema,
  goalRevision: z.number().int().min(1),
  expectedRevision: z.number().int().min(1),
  fromStatus: GoalStatusSchema,
  toStatus: GoalStatusSchema,
  verificationRef: OpaqueIdSchema.optional(),
  at: UtcTimestampSchema,
  by: OpaqueIdSchema,
});

export type GoalTransition = z.infer<typeof GoalTransitionSchema>;
