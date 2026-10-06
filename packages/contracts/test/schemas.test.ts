import { describe, expect, it } from "vitest";
import {
  AppendReceiptSchema,
  ApprovalRecordSchema,
  AuditReceiptSchema,
  BudgetRefSchema,
  BudgetReservationSchema,
  CandidateSchema,
  CheckpointSchema,
  CompressionRecordSchema,
  ConsolidationPlanSchema,
  DeliveryRecordSchema,
  EffectStatusSchema,
  EpisodeCommandSchema,
  EpisodeSchema,
  ErrorCodeSchema,
  EvalReportSchema,
  MemoryQuerySchema,
  MemoryRecordSchema,
  MemoryScopeSchema,
  MemoryWriteSchema,
  ModelRequestSchema,
  ModelResultSchema,
  NormalizedErrorSchema,
  ObservationSchema,
  PolicyDecisionSchema,
  PrincipalSchema,
  PromotionDecisionSchema,
  RunContextSchema,
  RunStatusSchema,
  SessionEventSchema,
  SkillManifestSchema,
  TaskEnvelopeSchema,
  TaskResultSchema,
  ToolManifestSchema,
  ToolResultSchema,
  WorkerDescriptorSchema,
  WriterLeaseSchema,
} from "../src/index.js";
import {
  PAST,
  appendReceipt,
  approvalRecord,
  auditReceipt,
  budgetRef,
  budgetReservation,
  candidate,
  checkpoint,
  compressionRecord,
  consolidationPlan,
  deliveryRecord,
  episode,
  episodeCommand,
  evalReport,
  memoryQuery,
  memoryRecordGlobal,
  memoryWrite,
  modelRequest,
  modelResult,
  normalizedError,
  observation,
  policyDecisionAllow,
  principal,
  promotionDecision,
  runContext,
  sessionEvent,
  skillManifest,
  taskEnvelope,
  taskResultCompleted,
  taskResultFailed,
  toolManifest,
  toolResultSucceeded,
  workerDescriptor,
  writerLease,
} from "./fixtures.js";

describe("versioning and tenancy", () => {
  it("rejects an invalid schemaVersion", () => {
    const event = sessionEvent({ schemaVersion: 2 });
    expect(SessionEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects a missing tenant", () => {
    const event = sessionEvent({ tenantId: undefined });
    expect(SessionEventSchema.safeParse(event).success).toBe(false);
  });

  it("requires trace and correlation identity on every envelope", () => {
    const withoutTrace = sessionEvent({ traceId: undefined });
    expect(SessionEventSchema.safeParse(withoutTrace).success).toBe(false);
    const withoutCorrelation = sessionEvent({ correlationId: undefined });
    expect(SessionEventSchema.safeParse(withoutCorrelation).success).toBe(false);
    const withoutCausation = sessionEvent({ causationId: undefined });
    expect(SessionEventSchema.safeParse(withoutCausation).success).toBe(false);
  });

  it("rejects unknown fields on strict wire objects", () => {
    const event = { ...sessionEvent(), unexpectedField: true };
    expect(SessionEventSchema.safeParse(event).success).toBe(false);
  });
});

describe("memory scope discipline", () => {
  it("rejects a Private memory record without an owner", () => {
    const privateWithoutOwner = memoryRecordGlobal({
      scope: "Private",
    });
    expect(MemoryRecordSchema.safeParse(privateWithoutOwner).success).toBe(
      false,
    );
  });

  it("rejects a Role memory record without a roleId", () => {
    const roleWithoutRoleId = memoryRecordGlobal({ scope: "Role" });
    expect(MemoryRecordSchema.safeParse(roleWithoutRoleId).success).toBe(false);
  });

  it("rejects a Global memory record carrying role or owner fields", () => {
    const globalWithRole = memoryRecordGlobal({ roleId: "role-1" });
    expect(MemoryRecordSchema.safeParse(globalWithRole).success).toBe(false);
    const globalWithOwner = memoryRecordGlobal({ ownerAgentId: "agent-1" });
    expect(MemoryRecordSchema.safeParse(globalWithOwner).success).toBe(false);
  });

  it("rejects cross-scope fields on Role and Private records", () => {
    const roleWithOwner = memoryRecordGlobal({
      scope: "Role",
      roleId: "role-1",
      ownerAgentId: "agent-1",
    });
    expect(MemoryRecordSchema.safeParse(roleWithOwner).success).toBe(false);
    const privateWithRole = memoryRecordGlobal({
      scope: "Private",
      ownerAgentId: "agent-1",
      roleId: "role-1",
    });
    expect(MemoryRecordSchema.safeParse(privateWithRole).success).toBe(false);
  });

  it("accepts well-scoped records for every scope", () => {
    expect(
      MemoryRecordSchema.safeParse(memoryRecordGlobal()).success,
    ).toBe(true);
    expect(
      MemoryRecordSchema.safeParse(
        memoryRecordGlobal({ scope: "Role", roleId: "role-1" }),
      ).success,
    ).toBe(true);
    expect(
      MemoryRecordSchema.safeParse(
        memoryRecordGlobal({ scope: "Private", ownerAgentId: "agent-1" }),
      ).success,
    ).toBe(true);
  });
});

describe("money and token bounds", () => {
  it("rejects negative micro-USD", () => {
    const reservation = budgetReservation({ reservedCostMicroUsd: -1 });
    expect(
      BudgetReservationSchema.safeParse(reservation).success,
    ).toBe(false);
  });

  it("rejects fractional micro-USD", () => {
    const reservation = budgetReservation({ reservedCostMicroUsd: 1.5 });
    expect(
      BudgetReservationSchema.safeParse(reservation).success,
    ).toBe(false);
  });

  it("rejects negative token counts", () => {
    const reservation = budgetReservation({ reservedTokens: -1 });
    expect(
      BudgetReservationSchema.safeParse(reservation).success,
    ).toBe(false);
    const result = modelResult({
      usageTokens: { inputTokens: -1, outputTokens: 0 },
    });
    expect(ModelResultSchema.safeParse(result).success).toBe(false);
  });
});

describe("UTC deadlines", () => {
  it("rejects an expired run deadline", () => {
    const context = runContext({ deadlineAt: PAST });
    expect(RunContextSchema.safeParse(context).success).toBe(false);
  });

  it("rejects an expired principal credential", () => {
    const expired = principal({ expiresAt: PAST });
    expect(PrincipalSchema.safeParse(expired).success).toBe(false);
  });

  it("rejects a non-UTC deadline offset", () => {
    const context = runContext({ deadlineAt: "2099-06-15T12:00:00+02:00" });
    expect(RunContextSchema.safeParse(context).success).toBe(false);
  });

  it("rejects a malformed deadline", () => {
    const context = runContext({ deadlineAt: "not-a-timestamp" });
    expect(RunContextSchema.safeParse(context).success).toBe(false);
    const contextWithoutZone = runContext({
      deadlineAt: "2099-06-15T12:00:00",
    });
    expect(RunContextSchema.safeParse(contextWithoutZone).success).toBe(false);
  });

  it("accepts a valid future UTC deadline", () => {
    expect(RunContextSchema.safeParse(runContext()).success).toBe(true);
  });
});

describe("discriminated task results", () => {
  it("rejects a result carrying both output and error", () => {
    const both = taskResultCompleted({
      error: normalizedError(),
    });
    expect(TaskResultSchema.safeParse(both).success).toBe(false);
  });

  it("rejects a failed result without an error", () => {
    const failed = taskResultFailed({ error: undefined });
    expect(TaskResultSchema.safeParse(failed).success).toBe(false);
  });

  it("rejects an unknown result carrying output", () => {
    const unknown = taskResultFailed({
      status: "unknown",
      error: undefined,
      output: { answer: "42" },
    });
    expect(TaskResultSchema.safeParse(unknown).success).toBe(false);
  });

  it("rejects a non-terminal run status on a task result", () => {
    const queued = taskResultCompleted({ status: "queued" });
    expect(TaskResultSchema.safeParse(queued).success).toBe(false);
  });

  it("accepts completed, failed, cancelled, budget-exhausted, and unknown results", () => {
    expect(
      TaskResultSchema.safeParse(taskResultCompleted()).success,
    ).toBe(true);
    expect(TaskResultSchema.safeParse(taskResultFailed()).success).toBe(true);
    expect(
      TaskResultSchema.safeParse(
        taskResultFailed({ status: "cancelled" }),
      ).success,
    ).toBe(true);
    expect(
      TaskResultSchema.safeParse(
        taskResultFailed({ status: "budget_exhausted" }),
      ).success,
    ).toBe(true);
    expect(
      TaskResultSchema.safeParse(
        taskResultFailed({ status: "unknown", error: undefined }),
      ).success,
    ).toBe(true);
  });
});

describe("optionality", () => {
  it("treats an absent optional field differently from a missing required field", () => {
    const withoutOptionalAgent = principal({ agentId: undefined });
    expect(PrincipalSchema.safeParse(withoutOptionalAgent).success).toBe(true);
    const withoutRequiredSubject = principal({ subjectId: undefined });
    expect(PrincipalSchema.safeParse(withoutRequiredSubject).success).toBe(
      false,
    );
  });

  it("rejects a required input record even though its values are open", () => {
    const withoutInput = taskEnvelope({ input: undefined });
    expect(TaskEnvelopeSchema.safeParse(withoutInput).success).toBe(false);
    const withEmptyInput = taskEnvelope({ input: {} });
    expect(TaskEnvelopeSchema.safeParse(withEmptyInput).success).toBe(true);
  });

  it("rejects an oversized bounded input record", () => {
    const oversized = taskEnvelope({
      input: { blob: "x".repeat(1048577) },
    });
    expect(TaskEnvelopeSchema.safeParse(oversized).success).toBe(false);
  });

  it("rejects inline tool content beyond 64 KiB", () => {
    const oversized = toolResultSucceeded({
      content: "x".repeat(65537),
    });
    expect(ToolResultSchema.safeParse(oversized).success).toBe(false);
    const atLimit = toolResultSucceeded({ content: "x".repeat(65536) });
    expect(ToolResultSchema.safeParse(atLimit).success).toBe(true);
  });
});

describe("memory query bounds", () => {
  it("rejects a limit above 100 and a limit below 1", () => {
    expect(
      MemoryQuerySchema.safeParse(memoryQuery({ limit: 101 })).success,
    ).toBe(false);
    expect(
      MemoryQuerySchema.safeParse(memoryQuery({ limit: 0 })).success,
    ).toBe(false);
    expect(
      MemoryQuerySchema.safeParse(memoryQuery({ limit: 100 })).success,
    ).toBe(true);
  });

  it("rejects an empty scope list", () => {
    const query = memoryQuery({ requestedScopes: [] });
    expect(MemoryQuerySchema.safeParse(query).success).toBe(false);
  });

  it("requires exactly one query form", () => {
    const bothForms = memoryQuery({
      query: { type: "text", text: "SSO", embeddingRef: "emb-1", dimension: 8 },
    });
    expect(MemoryQuerySchema.safeParse(bothForms).success).toBe(false);
  });
});

describe("episode writer epochs", () => {
  it("rejects a non-positive writer epoch", () => {
    const context = runContext({ writerEpoch: 0 });
    expect(RunContextSchema.safeParse(context).success).toBe(false);
    const lease = writerLease({ writerEpoch: 0 });
    expect(WriterLeaseSchema.safeParse(lease).success).toBe(false);
  });

  it("requires a run context or an ingress authority, not both", () => {
    const neither = episodeCommand({ runContext: undefined });
    expect(EpisodeCommandSchema.safeParse(neither).success).toBe(false);
    const both = episodeCommand({ ingressAuthority: "ingress-1" });
    expect(EpisodeCommandSchema.safeParse(both).success).toBe(false);
    const ingressOnly = episodeCommand({
      runContext: undefined,
      ingressAuthority: "ingress-1",
    });
    expect(EpisodeCommandSchema.safeParse(ingressOnly).success).toBe(true);
  });
});

describe("worker capacity", () => {
  it("rejects active capacity above max", () => {
    const over = workerDescriptor({ capacity: { active: 5, max: 4 } });
    expect(WorkerDescriptorSchema.safeParse(over).success).toBe(false);
  });
});

describe("error-code inventory", () => {
  it("accepts exactly the ten recorded error codes", () => {
    const codes = [
      "INVALID_INPUT",
      "UNAUTHENTICATED",
      "POLICY_DENIED",
      "APPROVAL_REQUIRED",
      "STALE_WRITER",
      "BUDGET_EXCEEDED",
      "TIMEOUT",
      "CANCELLED",
      "DEPENDENCY_UNAVAILABLE",
      "UNKNOWN_OUTCOME",
    ];
    for (const code of codes) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(ErrorCodeSchema.safeParse("INTERNAL_ERROR").success).toBe(false);
    expect(ErrorCodeSchema.safeParse("").success).toBe(false);
  });

  it("rejects stack traces and secret payloads in normalized errors", () => {
    const withStack = normalizedError({
      safeMessage: "boom",
      detailsRef: undefined,
    });
    const withExtra = { ...withStack, stack: "Error: boom" };
    expect(NormalizedErrorSchema.safeParse(withExtra).success).toBe(false);
  });
});

describe("state machine vocabularies", () => {
  it("accepts only the recorded run statuses", () => {
    for (const status of [
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
    ]) {
      expect(RunStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(RunStatusSchema.safeParse("done").success).toBe(false);
  });

  it("accepts only the recorded effect statuses", () => {
    for (const status of [
      "planned",
      "authorized",
      "executing",
      "succeeded",
      "failed",
      "unknown",
    ]) {
      expect(EffectStatusSchema.safeParse(status).success).toBe(true);
    }
    expect(EffectStatusSchema.safeParse("done").success).toBe(false);
  });

  it("accepts only the recorded memory scopes", () => {
    for (const scope of ["Global", "Role", "Private"]) {
      expect(MemoryScopeSchema.safeParse(scope).success).toBe(true);
    }
    expect(MemoryScopeSchema.safeParse("global").success).toBe(false);
    expect(MemoryScopeSchema.safeParse("Tenant").success).toBe(false);
  });
});

describe("supporting contracts", () => {
  it("validates budget references and reservations", () => {
    expect(BudgetRefSchema.safeParse(budgetRef()).success).toBe(true);
    expect(
      BudgetRefSchema.safeParse(budgetRef({ accountId: undefined })).success,
    ).toBe(false);
    expect(
      BudgetReservationSchema.safeParse(
        budgetReservation({ status: "spent" }),
      ).success,
    ).toBe(false);
  });

  it("validates policy decision variants", () => {
    expect(
      PolicyDecisionSchema.safeParse(policyDecisionAllow()).success,
    ).toBe(true);
    expect(
      PolicyDecisionSchema.safeParse({
        schemaVersion: 1,
        decisionId: "decision-1",
        policyVersion: "policy-1",
        decision: "deny",
        reason: "capability absent from principal",
      }).success,
    ).toBe(true);
    expect(
      PolicyDecisionSchema.safeParse({
        schemaVersion: 1,
        decisionId: "decision-1",
        policyVersion: "policy-1",
        decision: "approval_required",
        reason: "spend exceeds delegated limit",
      }).success,
    ).toBe(true);
    expect(
      PolicyDecisionSchema.safeParse({
        schemaVersion: 1,
        decisionId: "decision-1",
        policyVersion: "policy-1",
        decision: "allow",
      }).success,
    ).toBe(false);
  });

  it("validates approvals bound to exact effect arguments", () => {
    expect(ApprovalRecordSchema.safeParse(approvalRecord()).success).toBe(
      true,
    );
    expect(
      ApprovalRecordSchema.safeParse(
        approvalRecord({ inputHash: "not-a-hash" }),
      ).success,
    ).toBe(false);
    expect(
      ApprovalRecordSchema.safeParse(approvalRecord({ nonce: undefined }))
        .success,
    ).toBe(false);
  });

  it("validates model requests and results", () => {
    expect(ModelRequestSchema.safeParse(modelRequest()).success).toBe(true);
    expect(
      ModelRequestSchema.safeParse(
        modelRequest({ sensitivity: "top_secret" }),
      ).success,
    ).toBe(false);
    expect(ModelResultSchema.safeParse(modelResult()).success).toBe(true);
    expect(
      ModelResultSchema.safeParse(
        modelResult({ costMicroUsd: -1 }),
      ).success,
    ).toBe(false);
  });

  it("validates tool manifests, results, and skills", () => {
    expect(ToolManifestSchema.safeParse(toolManifest()).success).toBe(true);
    expect(
      ToolManifestSchema.safeParse(
        toolManifest({ executionClass: "remote" }),
      ).success,
    ).toBe(false);
    expect(
      ToolResultSchema.safeParse(toolResultSucceeded()).success,
    ).toBe(true);
    expect(
      ToolResultSchema.safeParse(
        toolResultSucceeded({
          status: "failed",
          content: undefined,
          error: normalizedError(),
        }),
      ).success,
    ).toBe(true);
    expect(SkillManifestSchema.safeParse(skillManifest()).success).toBe(true);
  });

  it("validates compression lineage", () => {
    expect(CompressionRecordSchema.safeParse(compressionRecord()).success).toBe(
      true,
    );
    expect(
      CompressionRecordSchema.safeParse(
        compressionRecord({ sourceRange: { startIndex: 9, endIndex: 0 } }),
      ).success,
    ).toBe(false);
  });

  it("validates audit receipts and delivery records", () => {
    expect(AuditReceiptSchema.safeParse(auditReceipt()).success).toBe(true);
    expect(
      AuditReceiptSchema.safeParse(
        auditReceipt({ sequence: 0 }),
      ).success,
    ).toBe(false);
    expect(DeliveryRecordSchema.safeParse(deliveryRecord()).success).toBe(
      true,
    );
    expect(
      DeliveryRecordSchema.safeParse(
        deliveryRecord({ status: "delivered" }),
      ).success,
    ).toBe(false);
  });

  it("validates checkpoints, episodes, and append receipts", () => {
    expect(CheckpointSchema.safeParse(checkpoint()).success).toBe(true);
    expect(EpisodeSchema.safeParse(episode()).success).toBe(true);
    expect(AppendReceiptSchema.safeParse(appendReceipt()).success).toBe(true);
  });

  it("validates memory writes with their authorizing effect request", () => {
    expect(MemoryWriteSchema.safeParse(memoryWrite()).success).toBe(true);
    expect(
      MemoryWriteSchema.safeParse(memoryWrite({ sourceEpisodeIds: [] }))
        .success,
    ).toBe(false);
  });

  it("validates consolidation plans, candidates, eval reports, and promotions", () => {
    expect(
      ConsolidationPlanSchema.safeParse(consolidationPlan()).success,
    ).toBe(true);
    expect(CandidateSchema.safeParse(candidate()).success).toBe(true);
    expect(EvalReportSchema.safeParse(evalReport()).success).toBe(true);
    expect(
      PromotionDecisionSchema.safeParse(promotionDecision()).success,
    ).toBe(true);
    expect(
      PromotionDecisionSchema.safeParse(
        promotionDecision({ approverIds: [] }),
      ).success,
    ).toBe(false);
  });

  it("validates observations", () => {
    expect(ObservationSchema.safeParse(observation()).success).toBe(true);
    expect(
      ObservationSchema.safeParse(observation({ confidence: 1.5 })).success,
    ).toBe(false);
  });
});
