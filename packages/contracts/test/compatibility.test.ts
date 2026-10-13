import { describe, it, expect } from "vitest";
import {
  TaskEnvelopeSchema,
  TaskResultSchema,
  RunContextSchema,
  GoalSpecSchema,
  GoalRecordSchema,
  TaskPlanSchema,
  EvidenceClaimSchema,
  VerificationReportSchema,
  ProjectRecordSchema,
} from "../src/index.js";
import type { TaskEnvelope, TaskResult, RunContext } from "../src/index.js";

const FUTURE = "2099-06-15T12:00:00.000Z";
const SHA_A = "a".repeat(64);

function budgetRef(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    accountId: "account-1",
    rootRunId: "run-1",
    ...overrides,
  };
}

function runContext(overrides: Record<string, unknown> = {}): RunContext {
  return {
    runId: "run-1",
    sessionId: "session-1",
    writerEpoch: 1,
    mode: "assist",
    deadlineAt: FUTURE,
    budgetRef: budgetRef(),
    ...overrides,
  };
}

function principal(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    subjectId: "subject-1",
    roles: ["user"],
    capabilities: ["chat:send"],
    audience: "gateway",
    expiresAt: FUTURE,
    authenticatedSource: "platform-adapter",
    ...overrides,
  };
}

function taskEnvelope(overrides: Record<string, unknown> = {}): TaskEnvelope {
  return {
    schemaVersion: 1,
    taskId: "task-1",
    traceId: "trace-1",
    correlationId: "correlation-1",
    causationId: "causation-1",
    runContext: runContext(),
    requiredCapabilities: ["chat:send"],
    input: { prompt: "summarize" },
    principalGrant: principal({
      capabilities: ["chat:send"],
      authenticatedSource: "supervisor-delegation",
    }),
    idempotencyKey: "idem-1",
    ...overrides,
  };
}

function taskResultCompleted(overrides: Record<string, unknown> = {}): TaskResult {
  return {
    schemaVersion: 1,
    taskId: "task-1",
    runId: "run-1",
    traceId: "trace-1",
    status: "completed",
    output: { answer: "42" },
    usage: { inputTokens: 10, outputTokens: 5 },
    evidenceRefs: [{ artifactId: "artifact-1", contentHash: SHA_A }],
    ...overrides,
  };
}

describe("Backward compatibility: existing schemas unchanged", () => {
  it("TaskEnvelopeSchema still parses existing fixtures", () => {
    const envelope = taskEnvelope();
    const result = TaskEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it("TaskResultSchema still parses existing completed result", () => {
    const result = TaskResultSchema.safeParse(taskResultCompleted());
    expect(result.success).toBe(true);
  });

  it("RunContextSchema still parses existing fixtures", () => {
    const ctx = runContext();
    const result = RunContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
  });

  it("TaskEnvelope still requires tenant match between principal and budget", () => {
    const envelope = taskEnvelope({
      principalGrant: principal({ tenantId: "tenant-2" }),
      runContext: runContext({ budgetRef: budgetRef({ tenantId: "tenant-1" }) }),
    });
    const result = TaskEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(false);
  });
});

describe("Forward compatibility: new schemas accept existing wire formats", () => {
  it("GoalSpecSchema uses schemaVersion=1 literal", () => {
    const spec = {
      schemaVersion: 1,
      goalId: "goal-1",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      objective: "test",
      criteria: [{ criterionId: "c1", description: "desc", evaluatorId: "eval-1", evidenceRequirement: "artifact", required: true }],
      constraintRefs: [],
      allowedResourceRefs: [],
      deadlineAt: FUTURE,
      budgetRef: budgetRef(),
      revision: 1,
    };
    const result = GoalSpecSchema.safeParse(spec);
    expect(result.success).toBe(true);
  });

  it("GoalRecordSchema uses schemaVersion=1 literal", () => {
    const record = {
      schemaVersion: 1,
      goalId: "goal-1",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      objective: "test",
      criteria: [{ criterionId: "c1", description: "desc", evaluatorId: "eval-1", evidenceRequirement: "artifact", required: true }],
      constraintRefs: [],
      allowedResourceRefs: [],
      deadlineAt: FUTURE,
      budgetRef: budgetRef(),
      revision: 1,
      status: "ready",
    };
    const result = GoalRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("TaskPlanSchema uses schemaVersion=1 literal", () => {
    const plan = {
      schemaVersion: 1,
      planId: "plan-1",
      tenantId: "tenant-1",
      goalId: "goal-1",
      goalRevision: 1,
      revision: 1,
      steps: [{ stepId: "step-1", taskType: "research", inputRef: "input-1", dependsOn: [], requiredCapabilities: ["cap-1"], expectedArtifactTypes: [], deadlineAt: FUTURE }],
      maxParallelism: 1,
      planDigest: { algorithm: "sha256", value: SHA_A },
    };
    const result = TaskPlanSchema.safeParse(plan);
    expect(result.success).toBe(true);
  });

  it("EvidenceClaimSchema uses schemaVersion=1 literal", () => {
    const claim = {
      schemaVersion: 1,
      claimId: "claim-1",
      text: "test",
      sourceRefs: ["src-1"],
      observedAt: "2026-06-15T12:00:00.000Z",
      verifiedAt: "2026-06-15T12:00:00.000Z",
      confidenceBasis: "measured",
      contradictionRefs: [],
    };
    const result = EvidenceClaimSchema.safeParse(claim);
    expect(result.success).toBe(true);
  });

  it("VerificationReportSchema uses schemaVersion=1 literal", () => {
    const report = {
      schemaVersion: 1,
      reportId: "report-1",
      goalId: "goal-1",
      goalRevision: 1,
      planDigest: { algorithm: "sha256", value: SHA_A },
      artifactDigests: [],
      criterionResults: [{ criterionId: "c1", satisfied: true, evidenceRefs: [], safeReason: "ok" }],
      verifierId: "verifier-1",
      verifierVersion: "1.0.0",
      checkedAt: "2026-06-15T12:00:00.000Z",
    };
    const result = VerificationReportSchema.safeParse(report);
    expect(result.success).toBe(true);
  });

  it("ProjectRecordSchema uses schemaVersion=1 literal", () => {
    const project = {
      schemaVersion: 1,
      projectId: "project-1",
      tenantId: "tenant-1",
      conversationId: "conv-1",
      goalIds: [],
      version: 1,
      budgetRef: budgetRef(),
      status: "active",
      artifactRefs: [],
      blockerRefs: [],
    };
    const result = ProjectRecordSchema.safeParse(project);
    expect(result.success).toBe(true);
  });
});

describe("Optional linking: TaskEnvelope can reference goal/project/verification", () => {
  it("TaskEnvelope can be extended with optional goalRef", () => {
    const envelope = taskEnvelope({
      goalRef: "goal-1",
      projectRef: "project-1",
      verificationRef: "verification-1",
    });
    const result = TaskEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it("TaskResult can be extended with optional goalRef", () => {
    const result = taskResultCompleted({ goalRef: "goal-1" });
    const parseResult = TaskResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  it("RunContext can be extended with optional goalRef", () => {
    const ctx = runContext({ goalRef: "goal-1" });
    const parseResult = RunContextSchema.safeParse(ctx);
    expect(parseResult.success).toBe(true);
  });
});

describe("No forced schemaVersion=2 migration", () => {
  it("All new schemas use schemaVersion=1", () => {
    const schemas = [
      { name: "GoalSpec", schema: GoalSpecSchema, data: { schemaVersion: 1, goalId: "g", tenantId: "t", conversationId: "c", objective: "o", criteria: [{ criterionId: "c1", description: "d", evaluatorId: "e", evidenceRequirement: "artifact", required: true }], constraintRefs: [], allowedResourceRefs: [], deadlineAt: FUTURE, budgetRef: budgetRef(), revision: 1 } },
      { name: "TaskPlan", schema: TaskPlanSchema, data: { schemaVersion: 1, planId: "p", tenantId: "t", goalId: "g", goalRevision: 1, revision: 1, steps: [{ stepId: "s1", taskType: "t", inputRef: "i", dependsOn: [], requiredCapabilities: ["c"], expectedArtifactTypes: [], deadlineAt: FUTURE }], maxParallelism: 1, planDigest: { algorithm: "sha256", value: SHA_A } } },
      { name: "EvidenceClaim", schema: EvidenceClaimSchema, data: { schemaVersion: 1, claimId: "c", text: "t", sourceRefs: ["s"], observedAt: "2026-06-15T12:00:00.000Z", confidenceBasis: "measured", contradictionRefs: [] } },
      { name: "VerificationReport", schema: VerificationReportSchema, data: { schemaVersion: 1, reportId: "r", goalId: "g", goalRevision: 1, planDigest: { algorithm: "sha256", value: SHA_A }, artifactDigests: [], criterionResults: [{ criterionId: "c1", satisfied: true, evidenceRefs: [], safeReason: "ok" }], verifierId: "v", verifierVersion: "1", checkedAt: "2026-06-15T12:00:00.000Z" } },
      { name: "ProjectRecord", schema: ProjectRecordSchema, data: { schemaVersion: 1, projectId: "p", tenantId: "t", conversationId: "c", goalIds: [], version: 1, budgetRef: budgetRef(), status: "active", artifactRefs: [], blockerRefs: [] } },
    ];

    for (const { name, schema, data } of schemas) {
      const result = schema.safeParse(data);
      expect(result.success, `${name} should parse with schemaVersion=1`).toBe(true);

      const v2Data = { ...data, schemaVersion: 2 };
      const v2Result = schema.safeParse(v2Data);
      expect(v2Result.success, `${name} should reject schemaVersion=2`).toBe(false);
    }
  });
});

describe("Existing test fixtures still work", () => {
  it("Existing compatibility fixtures parse", async () => {
    const { taskEnvelope: te } = await import("./fixtures.js");
    const envelope = te();
    const result = TaskEnvelopeSchema.safeParse(envelope);
    expect(result.success).toBe(true);
  });

  it("Existing TaskResult fixtures parse", async () => {
    const { taskResultCompleted: trc } = await import("./fixtures.js");
    const result = TaskResultSchema.safeParse(trc());
    expect(result.success).toBe(true);
  });

  it("Existing RunContext fixtures parse", async () => {
    const { runContext: rc } = await import("./fixtures.js");
    const ctx = rc();
    const result = RunContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
  });
});

import * as wire from "../src/index.js";
import * as fixtures from "./fixtures.js";
import { PolicyDecisionSchema as canonicalPolicyDecisionSchema } from "../src/effect.js";

describe("public wire contracts", () => {
  const contracts = {
    AppendReceipt: [wire.AppendReceiptSchema, fixtures.appendReceipt],
    ApprovalRecord: [wire.ApprovalRecordSchema, fixtures.approvalRecord],
    AuditReceipt: [wire.AuditReceiptSchema, fixtures.auditReceipt],
    BudgetRef: [wire.BudgetRefSchema, fixtures.budgetRef],
    BudgetReservation: [wire.BudgetReservationSchema, fixtures.budgetReservation],
    Candidate: [wire.CandidateSchema, fixtures.candidate],
    Checkpoint: [wire.CheckpointSchema, fixtures.checkpoint],
    CompressionRecord: [wire.CompressionRecordSchema, fixtures.compressionRecord],
    ConsolidationPlan: [wire.ConsolidationPlanSchema, fixtures.consolidationPlan],
    DeliveryRecord: [wire.DeliveryRecordSchema, fixtures.deliveryRecord],
    EffectRequest: [wire.EffectRequestSchema, fixtures.effectRequest],
    Episode: [wire.EpisodeSchema, fixtures.episode],
    EpisodeCommand: [wire.EpisodeCommandSchema, fixtures.episodeCommand],
    EvalReport: [wire.EvalReportSchema, fixtures.evalReport],
    MemoryQuery: [wire.MemoryQuerySchema, fixtures.memoryQuery],
    MemoryRecord: [wire.MemoryRecordSchema, fixtures.memoryRecordGlobal],
    MemoryWrite: [wire.MemoryWriteSchema, fixtures.memoryWrite],
    ModelRequest: [wire.ModelRequestSchema, fixtures.modelRequest],
    ModelResult: [wire.ModelResultSchema, fixtures.modelResult],
    NormalizedError: [wire.NormalizedErrorSchema, fixtures.normalizedError],
    Observation: [wire.ObservationSchema, fixtures.observation],
    PolicyDecision: [wire.PolicyDecisionSchema, fixtures.policyDecisionAllow],
    Principal: [wire.PrincipalSchema, fixtures.principal],
    PromotionDecision: [wire.PromotionDecisionSchema, fixtures.promotionDecision],
    RunContext: [wire.RunContextSchema, fixtures.runContext],
    SessionEvent: [wire.SessionEventSchema, fixtures.sessionEvent],
    SkillManifest: [wire.SkillManifestSchema, fixtures.skillManifest],
    TaskEnvelope: [wire.TaskEnvelopeSchema, fixtures.taskEnvelope],
    TaskResult: [wire.TaskResultSchema, fixtures.taskResultCompleted],
    ToolManifest: [wire.ToolManifestSchema, fixtures.toolManifest],
    ToolResult: [wire.ToolResultSchema, fixtures.toolResultSucceeded],
    WorkerDescriptor: [wire.WorkerDescriptorSchema, fixtures.workerDescriptor],
    WriterLease: [wire.WriterLeaseSchema, fixtures.writerLease],
  } as const;
  for (const [name, [schema, fixture]] of Object.entries(contracts)) {
    it(name + " accepts the canonical fixture", () => {
      expect(schema.safeParse(fixture()).success).toBe(true);
    });
    it(name + " matches the frozen wire shape snapshot", () => {
      const parsed = schema.parse(fixture());
      const shape = Object.fromEntries(Object.keys(parsed).sort().map(key => {
        const withoutKey: Record<string, unknown> = { ...parsed };
        delete withoutKey[key];
        return [key, schema.safeParse(withoutKey).success ? "optional" : "required"];
      }));
      expect(shape).toMatchSnapshot();
    });
  }
  it("exports the canonical effect decision schema rather than an alternate policy wire", () => {
    expect(wire.PolicyDecisionSchema).toBe(canonicalPolicyDecisionSchema);
  });
});


describe("legacy rename rejection", () => {
  const legacy = {
    "legacy-task-result.json": wire.TaskResultSchema,
    "legacy-session-event.json": wire.SessionEventSchema,
    "legacy-normalized-error.json": wire.NormalizedErrorSchema,
    "legacy-memory-record.json": wire.MemoryRecordSchema,
  } as const;
  for (const [file, schema] of Object.entries(legacy)) {
    it("rejects accidental legacy field aliases in " + file, async () => {
      const { readFileSync } = await import("node:fs");
      const payload: unknown = JSON.parse(readFileSync(new URL("../../../tests/fixtures/contracts/" + file, import.meta.url), "utf8"));
      expect(schema.safeParse(payload).success).toBe(false);
    });
  }
});
