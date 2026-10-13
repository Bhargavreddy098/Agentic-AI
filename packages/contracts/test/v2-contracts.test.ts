import { describe, it, expect } from "vitest";
import { GoalSpecSchema, GoalRecordSchema, TaskPlanSchema, EvidenceClaimSchema, VerificationReportSchema, ProjectRecordSchema, PlanValidationResultSchema, validatePlan, computePlanDigest, ConfidenceBasisSchema, GoalStatusSchema, GoalSchemaVersionSchema, PlanSchemaVersionSchema, EvidenceSchemaVersionSchema, ProjectSchemaVersionSchema } from "../src/index.js";
import { ProjectStatusSchema } from "../src/project.js";
import type { GoalSpec, GoalRecord, TaskPlan, PlanStep, EvidenceClaim, VerificationReport, ProjectRecord } from "../src/index.js";

const FUTURE = "2099-06-15T12:00:00.000Z";
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function budgetRef(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    accountId: "account-1",
    rootRunId: "run-1",
    ...overrides,
  };
}

function goalSpec(overrides: Record<string, unknown> = {}): GoalSpec {
  return {
    schemaVersion: 1,
    goalId: "goal-1",
    tenantId: "tenant-1",
    conversationId: "conv-1",
    objective: "Research TypeScript agent systems and produce a report",
    criteria: [
      {
        criterionId: "criterion-1",
        description: "Report covers architecture patterns",
        evaluatorId: "evaluator-1",
        evidenceRequirement: "artifact",
        required: true,
      },
      {
        criterionId: "criterion-2",
        description: "Report includes code examples",
        evaluatorId: "evaluator-2",
        evidenceRequirement: "test",
        required: false,
      },
    ],
    constraintRefs: [],
    allowedResourceRefs: [],
    deadlineAt: FUTURE,
    budgetRef: budgetRef(),
    revision: 1,
    ...overrides,
  };
}

function goalRecord(overrides: Record<string, unknown> = {}): GoalRecord {
  return {
    ...goalSpec(),
    status: "ready",
    ...overrides,
  };
}

function planStep(overrides: Record<string, unknown> = {}): PlanStep {
  return {
    stepId: "step-1",
    taskType: "research",
    inputRef: "input-1",
    dependsOn: [],
    requiredCapabilities: ["research:web"],
    expectedArtifactTypes: ["report"],
    deadlineAt: FUTURE,
    ...overrides,
  };
}

function taskPlan(overrides: Record<string, unknown> = {}): TaskPlan {
  const steps = [planStep(), planStep({ stepId: "step-2", dependsOn: ["step-1"] })];
  return {
    schemaVersion: 1,
    planId: "plan-1",
    tenantId: "tenant-1",
    goalId: "goal-1",
    goalRevision: 1,
    revision: 1,
    steps,
    maxParallelism: 2,
    planDigest: { algorithm: "sha256", value: SHA_A },
    ...overrides,
  };
}

function evidenceClaim(overrides: Record<string, unknown> = {}): EvidenceClaim {
  return {
    schemaVersion: 1,
    claimId: "claim-1",
    text: "TypeScript agents use Zod for validation",
    sourceRefs: ["source-1"],
    observedAt: "2026-06-15T12:00:00.000Z",
    verifiedAt: "2026-06-15T12:00:00.000Z",
    confidenceBasis: "measured",
    contradictionRefs: [],
    ...overrides,
  };
}

function verificationReport(overrides: Record<string, unknown> = {}): VerificationReport {
  return {
    schemaVersion: 1,
    reportId: "report-1",
    goalId: "goal-1",
    goalRevision: 1,
    planDigest: { algorithm: "sha256", value: SHA_A },
    artifactDigests: [{ algorithm: "sha256", value: SHA_B }],
    criterionResults: [
      {
        criterionId: "criterion-1",
        satisfied: true,
        evidenceRefs: ["claim-1"],
        safeReason: "Report contains architecture section",
      },
      {
        criterionId: "criterion-2",
        satisfied: false,
        evidenceRefs: [],
        safeReason: "No code examples found",
      },
    ],
    verifierId: "verifier-1",
    verifierVersion: "1.0.0",
    checkedAt: "2026-06-15T12:00:00.000Z",
    ...overrides,
  };
}

function projectRecord(overrides: Record<string, unknown> = {}): ProjectRecord {
  return {
    schemaVersion: 1,
    projectId: "project-1",
    tenantId: "tenant-1",
    conversationId: "conv-1",
    goalIds: ["goal-1"],
    version: 1,
    budgetRef: budgetRef(),
    status: "active",
    artifactRefs: [{ artifactId: "artifact-1", contentHash: SHA_A }],
    blockerRefs: [],
    ...overrides,
  };
}

describe("GoalSpec/GoalRecord", () => {
  it("parses valid GoalSpec", () => {
    const result = GoalSpecSchema.safeParse(goalSpec());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.goalId).toBe("goal-1");
      expect(result.data.criteria.length).toBe(2);
      expect(result.data.schemaVersion).toBe(1);
    }
  });

  it("rejects GoalSpec with empty objective", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ objective: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with objective > 8192 bytes", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ objective: "x".repeat(8193) }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with no criteria", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ criteria: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with >32 criteria", () => {
    const criteria = Array.from({ length: 33 }, (_, i) => ({
      criterionId: `criterion-${i}`,
      description: "test",
      evaluatorId: `eval-${i}`,
      evidenceRequirement: "artifact" as const,
      required: true,
    }));
    const result = GoalSpecSchema.safeParse(goalSpec({ criteria }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with >64 constraintRefs", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ constraintRefs: Array(65).fill("ref") }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with >64 allowedResourceRefs", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ allowedResourceRefs: Array(65).fill("ref") }));
    expect(result.success).toBe(false);
  });

  it("rejects GoalSpec with past deadline", () => {
    const result = GoalSpecSchema.safeParse(goalSpec({ deadlineAt: "2001-06-15T12:00:00.000Z" }));
    expect(result.success).toBe(false);
  });

  it("parses valid GoalRecord with all statuses", () => {
    for (const status of GoalStatusSchema.options) {
      const result = GoalRecordSchema.safeParse(goalRecord({ status }));
      expect(result.success).toBe(true);
    }
  });

  it("GoalRecord defaults revision to 1", () => {
    const result = GoalRecordSchema.safeParse(goalRecord({ revision: undefined }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.revision).toBe(1);
  });
});

describe("TaskPlan/PlanStep", () => {
  it("parses valid TaskPlan", () => {
    const result = TaskPlanSchema.safeParse(taskPlan());
    expect(result.success).toBe(true);
  });

  it("rejects TaskPlan with duplicate stepIds", () => {
    const steps = [planStep({ stepId: "step-1" }), planStep({ stepId: "step-1" })];
    const result = TaskPlanSchema.safeParse(taskPlan({ steps }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with unknown dependency", () => {
    const steps = [planStep({ stepId: "step-1", dependsOn: ["unknown"] })];
    const result = TaskPlanSchema.safeParse(taskPlan({ steps }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with cycle", () => {
    const steps = [
      planStep({ stepId: "step-1", dependsOn: ["step-2"] }),
      planStep({ stepId: "step-2", dependsOn: ["step-1"] }),
    ];
    const result = TaskPlanSchema.safeParse(taskPlan({ steps }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with empty steps", () => {
    const result = TaskPlanSchema.safeParse(taskPlan({ steps: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with >64 steps", () => {
    const steps = Array.from({ length: 65 }, (_, i) => planStep({ stepId: `step-${i}` }));
    const result = TaskPlanSchema.safeParse(taskPlan({ steps }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with maxParallelism > 8", () => {
    const result = TaskPlanSchema.safeParse(taskPlan({ maxParallelism: 9 }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with step having empty requiredCapabilities", () => {
    const result = TaskPlanSchema.safeParse(taskPlan({ steps: [planStep({ requiredCapabilities: [] })] }));
    expect(result.success).toBe(false);
  });

  it("rejects TaskPlan with step having >128 requiredCapabilities", () => {
    const caps = Array(129).fill("cap");
    const result = TaskPlanSchema.safeParse(taskPlan({ steps: [planStep({ requiredCapabilities: caps })] }));
    expect(result.success).toBe(false);
  });

  it("computes deterministic plan digest", () => {
    const plan = taskPlan();
    const digest1 = computePlanDigest(plan);
    const digest2 = computePlanDigest(plan);
    expect(digest1).toEqual(digest2);
  });

  it("validates plan against goal", () => {
    const plan = taskPlan();
    const goal = { goalId: "goal-1", goalRevision: 1 };
    const result = validatePlan(plan, goal);
    expect(result.valid).toBe(true);
  });

  it("rejects plan with mismatched goalId", () => {
    const plan = taskPlan({ goalId: "goal-2" });
    const goal = { goalId: "goal-1", goalRevision: 1 };
    const result = validatePlan(plan, goal);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors[0]?.code).toBe("GOAL_ID_MISMATCH");
  });

  it("rejects plan with mismatched goalRevision", () => {
    const plan = taskPlan({ goalRevision: 2 });
    const goal = { goalId: "goal-1", goalRevision: 1 };
    const result = validatePlan(plan, goal);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors[0]?.code).toBe("GOAL_REVISION_MISMATCH");
  });
});

describe("EvidenceClaim", () => {
  it("parses valid EvidenceClaim", () => {
    const result = EvidenceClaimSchema.safeParse(evidenceClaim());
    expect(result.success).toBe(true);
  });

  it("rejects EvidenceClaim with empty sourceRefs", () => {
    const result = EvidenceClaimSchema.safeParse(evidenceClaim({ sourceRefs: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects EvidenceClaim with >64 sourceRefs", () => {
    const result = EvidenceClaimSchema.safeParse(evidenceClaim({ sourceRefs: Array(65).fill("ref") }));
    expect(result.success).toBe(false);
  });

  it("accepts valid confidenceBasis values", () => {
    for (const basis of ConfidenceBasisSchema.options) {
      const result = EvidenceClaimSchema.safeParse(evidenceClaim({ confidenceBasis: basis }));
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid confidenceBasis", () => {
    const result = EvidenceClaimSchema.safeParse(evidenceClaim({ confidenceBasis: "invalid" }));
    expect(result.success).toBe(false);
  });
});

describe("VerificationReport", () => {
  it("parses valid VerificationReport", () => {
    const result = VerificationReportSchema.safeParse(verificationReport());
    expect(result.success).toBe(true);
  });

  it("requires at least 1 criterionResult", () => {
    const result = VerificationReportSchema.safeParse(verificationReport({ criterionResults: [] }));
    expect(result.success).toBe(false);
  });

  it("rejects >32 criterionResults", () => {
    const results = Array.from({ length: 33 }, (_, i) => ({
      criterionId: `criterion-${i}`,
      satisfied: true,
      evidenceRefs: [],
      safeReason: "ok",
    }));
    const result = VerificationReportSchema.safeParse(verificationReport({ criterionResults: results }));
    expect(result.success).toBe(false);
  });

  it("accepts satisfied: true/false/null", () => {
    for (const satisfied of [true, false, null]) {
      const result = VerificationReportSchema.safeParse(verificationReport({
        criterionResults: [{ criterionId: "c1", satisfied, evidenceRefs: [], safeReason: "ok" }],
      }));
      expect(result.success).toBe(true);
    }
  });
});

describe("ProjectRecord", () => {
  it("parses valid ProjectRecord", () => {
    const result = ProjectRecordSchema.safeParse(projectRecord());
    expect(result.success).toBe(true);
  });

  it("rejects ProjectRecord with >256 goalIds", () => {
    const result = ProjectRecordSchema.safeParse(projectRecord({ goalIds: Array(257).fill("goal") }));
    expect(result.success).toBe(false);
  });

  it("rejects ProjectRecord with >1024 artifactRefs", () => {
    const result = ProjectRecordSchema.safeParse(projectRecord({ artifactRefs: Array(1025).fill({ artifactId: "a", contentHash: SHA_A }) }));
    expect(result.success).toBe(false);
  });

  it("rejects ProjectRecord with >256 blockerRefs", () => {
    const result = ProjectRecordSchema.safeParse(projectRecord({ blockerRefs: Array(257).fill("blocker") }));
    expect(result.success).toBe(false);
  });

  it("accepts all status values", () => {
    for (const status of ProjectStatusSchema.options) {
      const result = ProjectRecordSchema.safeParse(projectRecord({ status }));
      expect(result.success).toBe(true);
    }
  });
});

describe("Schema versions", () => {
  it("GoalSchemaVersionSchema is 1", () => {
    expect(GoalSchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(GoalSchemaVersionSchema.safeParse(2).success).toBe(false);
  });

  it("PlanSchemaVersionSchema is 1", () => {
    expect(PlanSchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(PlanSchemaVersionSchema.safeParse(2).success).toBe(false);
  });

  it("EvidenceSchemaVersionSchema is 1", () => {
    expect(EvidenceSchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(EvidenceSchemaVersionSchema.safeParse(2).success).toBe(false);
  });

  it("ProjectSchemaVersionSchema is 1", () => {
    expect(ProjectSchemaVersionSchema.safeParse(1).success).toBe(true);
    expect(ProjectSchemaVersionSchema.safeParse(2).success).toBe(false);
  });
});

describe("PlanValidationResult", () => {
  it("accepts valid result", () => {
    const result = PlanValidationResultSchema.safeParse({
      valid: true,
      planDigest: { algorithm: "sha256", value: SHA_A },
    });
    expect(result.success).toBe(true);
  });

  it("accepts invalid result with errors", () => {
    const result = PlanValidationResultSchema.safeParse({
      valid: false,
      errors: [{ code: "CYCLE_DETECTED", safeReason: "Cycle in step-1 -> step-2 -> step-1" }],
    });
    expect(result.success).toBe(true);
  });

  it("requires errors when valid=false", () => {
    const result = PlanValidationResultSchema.safeParse({ valid: false, errors: [] });
    expect(result.success).toBe(false);
  });
});