import { z } from "zod/v4";
import { OpaqueIdSchema, FutureUtcTimestampSchema } from "./primitives.js";

export const PlanSchemaVersionSchema = z.literal(1);

export const PlanStepSchema = z.strictObject({
  stepId: OpaqueIdSchema,
  taskType: z.string().min(1).max(128),
  inputRef: OpaqueIdSchema,
  dependsOn: z.array(OpaqueIdSchema).max(64).default([]),
  requiredCapabilities: z.array(OpaqueIdSchema).min(1).max(128),
  expectedArtifactTypes: z.array(z.string().min(1).max(64)).max(16).default([]),
  deadlineAt: FutureUtcTimestampSchema,
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanDigestSchema = z.strictObject({
  algorithm: z.literal("sha256"),
  value: z.string().regex(/^[a-f0-9]{64}$/),
});

export type PlanDigest = z.infer<typeof PlanDigestSchema>;

export const TaskPlanSchema = z.strictObject({
  schemaVersion: PlanSchemaVersionSchema,
  planId: OpaqueIdSchema,
  tenantId: OpaqueIdSchema,
  goalId: OpaqueIdSchema,
  goalRevision: z.number().int().min(1),
  revision: z.number().int().min(1).default(1),
  steps: z.array(PlanStepSchema).min(1).max(64),
  maxParallelism: z.number().int().min(1).max(8).default(1),
  planDigest: PlanDigestSchema,
}).superRefine((plan, ctx) => {
  const stepIds = new Set<string>();
  for (const step of plan.steps) {
    if (stepIds.has(step.stepId)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate stepId: ${step.stepId}`,
        path: ["steps"],
      });
    }
    stepIds.add(step.stepId);
  }

  for (const step of plan.steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        ctx.addIssue({
          code: "custom",
          message: `Step ${step.stepId} depends on unknown step ${dep}`,
          path: ["steps"],
        });
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const adjacency = new Map<string, string[]>();

  for (const step of plan.steps) {
    adjacency.set(step.stepId, step.dependsOn);
  }

  function visit(node: string) {
    if (visited.has(node)) return;
    if (visiting.has(node)) {
      ctx.addIssue({
        code: "custom",
        message: `Cycle detected in plan dependencies involving ${node}`,
        path: ["steps"],
      });
      return;
    }
    visiting.add(node);
    for (const dep of adjacency.get(node) ?? []) {
      visit(dep);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const step of plan.steps) {
    visit(step.stepId);
  }
});

export type TaskPlan = z.infer<typeof TaskPlanSchema>;

export const PlanValidationResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    planDigest: PlanDigestSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    errors: z.array(z.strictObject({
      code: z.string().min(1).max(64),
      stepId: OpaqueIdSchema.optional(),
      safeReason: z.string().min(1).max(1024),
    })).min(1).max(256),
  }),
]);

export type PlanValidationResult = z.infer<typeof PlanValidationResultSchema>;

export function computePlanDigest(plan: Omit<TaskPlan, "planDigest">): PlanDigest {
  const canonical = JSON.stringify(plan, Object.keys(plan).sort());
  const hash = new TextEncoder().encode(canonical);
  return { algorithm: "sha256", value: Array.from(hash).map(b => b.toString(16).padStart(2, "0")).join("") };
}

export function validatePlan(plan: TaskPlan, goal: { goalId: string; goalRevision: number }): PlanValidationResult {
  if (plan.goalId !== goal.goalId) {
    return {
      valid: false,
      errors: [{ code: "GOAL_ID_MISMATCH", safeReason: "Plan goalId does not match goal" }],
    };
  }
  if (plan.goalRevision !== goal.goalRevision) {
    return {
      valid: false,
      errors: [{ code: "GOAL_REVISION_MISMATCH", safeReason: "Plan goalRevision does not match goal" }],
    };
  }
  const result = TaskPlanSchema.safeParse(plan);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(issue => ({
        code: "VALIDATION_ERROR",
        stepId: issue.path.length > 1 ? issue.path[1] as string : undefined,
        safeReason: issue.message,
      })),
    };
  }
  return { valid: true, planDigest: computePlanDigest(plan) };
}