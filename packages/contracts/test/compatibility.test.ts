import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  AppendReceiptSchema,
  ApprovalRecordSchema,
  AuditReceiptSchema,
  BudgetReservationSchema,
  BudgetRefSchema,
  CandidateSchema,
  CheckpointSchema,
  CompressionRecordSchema,
  ConsolidationPlanSchema,
  DeliveryRecordSchema,
  EffectRequestSchema,
  EpisodeCommandSchema,
  EpisodeSchema,
  EvalReportSchema,
  MemoryQuerySchema,
  MemoryRecordSchema,
  MemoryWriteSchema,
  ModelRequestSchema,
  ModelResultSchema,
  NormalizedErrorSchema,
  ObservationSchema,
  PolicyDecisionSchema,
  PrincipalSchema,
  PromotionDecisionSchema,
  RunContextSchema,
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
  effectRequest,
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
  toolManifest,
  toolResultSucceeded,
  workerDescriptor,
  writerLease,
} from "./fixtures.js";

const testDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(testDirectory, "..", "..", "..");

const publicWireContracts: Record<
  string,
  { schema: z.ZodType; fixture: Record<string, unknown> }
> = {
  Principal: { schema: PrincipalSchema, fixture: principal() },
  SessionEvent: { schema: SessionEventSchema, fixture: sessionEvent() },
  RunContext: { schema: RunContextSchema, fixture: runContext() },
  TaskEnvelope: { schema: TaskEnvelopeSchema, fixture: taskEnvelope() },
  TaskResult: {
    schema: TaskResultSchema,
    fixture: taskResultCompleted(),
  },
  EffectRequest: { schema: EffectRequestSchema, fixture: effectRequest() },
  PolicyDecision: {
    schema: PolicyDecisionSchema,
    fixture: policyDecisionAllow(),
  },
  ApprovalRecord: { schema: ApprovalRecordSchema, fixture: approvalRecord() },
  ModelRequest: { schema: ModelRequestSchema, fixture: modelRequest() },
  ToolManifest: { schema: ToolManifestSchema, fixture: toolManifest() },
  ToolResult: { schema: ToolResultSchema, fixture: toolResultSucceeded() },
  MemoryRecord: { schema: MemoryRecordSchema, fixture: memoryRecordGlobal() },
  CompressionRecord: {
    schema: CompressionRecordSchema,
    fixture: compressionRecord(),
  },
  AuditReceipt: { schema: AuditReceiptSchema, fixture: auditReceipt() },
  DeliveryRecord: { schema: DeliveryRecordSchema, fixture: deliveryRecord() },
  BudgetRef: { schema: BudgetRefSchema, fixture: budgetRef() },
  BudgetReservation: {
    schema: BudgetReservationSchema,
    fixture: budgetReservation(),
  },
  WriterLease: { schema: WriterLeaseSchema, fixture: writerLease() },
  Checkpoint: { schema: CheckpointSchema, fixture: checkpoint() },
  EpisodeCommand: { schema: EpisodeCommandSchema, fixture: episodeCommand() },
  AppendReceipt: { schema: AppendReceiptSchema, fixture: appendReceipt() },
  Episode: { schema: EpisodeSchema, fixture: episode() },
  MemoryQuery: { schema: MemoryQuerySchema, fixture: memoryQuery() },
  MemoryWrite: { schema: MemoryWriteSchema, fixture: memoryWrite() },
  WorkerDescriptor: {
    schema: WorkerDescriptorSchema,
    fixture: workerDescriptor(),
  },
  NormalizedError: { schema: NormalizedErrorSchema, fixture: normalizedError() },
  ModelResult: { schema: ModelResultSchema, fixture: modelResult() },
  SkillManifest: { schema: SkillManifestSchema, fixture: skillManifest() },
  ConsolidationPlan: {
    schema: ConsolidationPlanSchema,
    fixture: consolidationPlan(),
  },
  Candidate: { schema: CandidateSchema, fixture: candidate() },
  EvalReport: { schema: EvalReportSchema, fixture: evalReport() },
  PromotionDecision: {
    schema: PromotionDecisionSchema,
    fixture: promotionDecision(),
  },
  Observation: { schema: ObservationSchema, fixture: observation() },
};

function wireShape(
  schema: z.ZodType,
  fixture: Record<string, unknown>,
): Record<string, string> {
  const shape: Record<string, string> = {};
  for (const key of Object.keys(fixture)) {
    const withoutKey: Record<string, unknown> = { ...fixture };
    delete withoutKey[key];
    shape[key] = schema.safeParse(withoutKey).success ? "optional" : "required";
  }
  return shape;
}

describe("public wire contracts", () => {
  for (const [name, contract] of Object.entries(publicWireContracts)) {
    it(`${name} accepts the canonical fixture`, () => {
      const result = contract.schema.safeParse(contract.fixture);
      expect(result.success).toBe(true);
    });

    it(`${name} matches the frozen wire shape snapshot`, () => {
      expect(wireShape(contract.schema, contract.fixture)).toMatchSnapshot();
    });
  }
});

function loadFixture(fileName: string): unknown {
  return JSON.parse(
    readFileSync(join(repositoryRoot, "tests", "fixtures", "contracts", fileName), "utf8"),
  );
}

describe("compatibility fixtures reject accidental breaking renames", () => {
  it("rejects the legacy session event shape", () => {
    const legacy = loadFixture("legacy-session-event.json");
    expect(SessionEventSchema.safeParse(legacy).success).toBe(false);
  });

  it("rejects the legacy normalized error shape", () => {
    const legacy = loadFixture("legacy-normalized-error.json");
    expect(NormalizedErrorSchema.safeParse(legacy).success).toBe(false);
  });

  it("rejects the legacy memory record shape", () => {
    const legacy = loadFixture("legacy-memory-record.json");
    expect(MemoryRecordSchema.safeParse(legacy).success).toBe(false);
  });

  it("rejects the legacy task result shape", () => {
    const legacy = loadFixture("legacy-task-result.json");
    expect(TaskResultSchema.safeParse(legacy).success).toBe(false);
  });
});
