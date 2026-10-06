import type {
  AppendReceipt,
  ApprovalRecord,
  AuditReceipt,
  BudgetReservation,
  BudgetRef,
  Candidate,
  Checkpoint,
  CompressionRecord,
  ConsolidationPlan,
  DeliveryRecord,
  EffectRequest,
  Episode,
  EpisodeCommand,
  EvalReport,
  MemoryQuery,
  MemoryRecord,
  MemoryWrite,
  ModelRequest,
  ModelResult,
  NormalizedError,
  Observation,
  PolicyDecision,
  Principal,
  PromotionDecision,
  RunContext,
  SessionEvent,
  SkillManifest,
  TaskEnvelope,
  TaskResult,
  ToolManifest,
  ToolResult,
  WorkerDescriptor,
  WriterLease,
} from "../src/index.js";

export const FUTURE = "2099-06-15T12:00:00.000Z";
export const PAST = "2001-06-15T12:00:00.000Z";
export const RECEIVED_AT = "2026-06-15T12:00:00.000Z";
export const SHA_A = "a".repeat(64);
export const SHA_B = "b".repeat(64);
export const SHA_C = "c".repeat(64);

export function principal(overrides: Record<string, unknown> = {}): Principal {
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

export function budgetRef(overrides: Record<string, unknown> = {}): BudgetRef {
  return {
    tenantId: "tenant-1",
    accountId: "account-1",
    rootRunId: "run-1",
    ...overrides,
  };
}

export function budgetReservation(
  overrides: Record<string, unknown> = {},
): BudgetReservation {
  return {
    reservationId: "reservation-1",
    budgetRef: budgetRef(),
    reservedTokens: 1000,
    reservedCostMicroUsd: 500,
    status: "reserved",
    ...overrides,
  };
}

export function runContext(overrides: Record<string, unknown> = {}): RunContext {
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

export function sessionEvent(
  overrides: Record<string, unknown> = {},
): SessionEvent {
  return {
    schemaVersion: 1,
    eventId: "event-1",
    tenantId: "tenant-1",
    sessionId: "session-1",
    platform: "whatsapp",
    traceId: "trace-1",
    correlationId: "correlation-1",
    causationId: "causation-1",
    principal: principal(),
    receivedAt: RECEIVED_AT,
    content: [{ type: "text", text: "hello" }],
    ...overrides,
  };
}

export function taskEnvelope(
  overrides: Record<string, unknown> = {},
): TaskEnvelope {
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

export function taskResultCompleted(
  overrides: Record<string, unknown> = {},
): TaskResult {
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

export function taskResultFailed(
  overrides: Record<string, unknown> = {},
): TaskResult {
  return {
    schemaVersion: 1,
    taskId: "task-1",
    runId: "run-1",
    traceId: "trace-1",
    status: "failed",
    error: normalizedError(),
    usage: { inputTokens: 10, outputTokens: 5 },
    evidenceRefs: [],
    ...overrides,
  };
}

export function effectRequest(
  overrides: Record<string, unknown> = {},
): EffectRequest {
  return {
    schemaVersion: 1,
    effectId: "effect-1",
    action: "message.send",
    resource: "channel:whatsapp:tenant-1",
    inputHash: SHA_A,
    runContext: runContext(),
    idempotencyKey: "idem-1",
    traceId: "trace-1",
    ...overrides,
  };
}

export function policyDecisionAllow(
  overrides: Record<string, unknown> = {},
): PolicyDecision {
  return {
    schemaVersion: 1,
    decisionId: "decision-1",
    policyVersion: "policy-1",
    decision: "allow",
    boundCapability: "message.send",
    boundExpiresAt: FUTURE,
    ...overrides,
  };
}

export function approvalRecord(
  overrides: Record<string, unknown> = {},
): ApprovalRecord {
  return {
    schemaVersion: 1,
    approvalId: "approval-1",
    approver: principal({ subjectId: "approver-1", capabilities: ["approve"] }),
    effectId: "effect-1",
    inputHash: SHA_A,
    policyVersion: "policy-1",
    expiresAt: FUTURE,
    nonce: "nonce-1",
    ...overrides,
  };
}

export function modelRequest(
  overrides: Record<string, unknown> = {},
): ModelRequest {
  return {
    schemaVersion: 1,
    modelClass: "reasoning",
    promptParts: [{ type: "text", text: "summarize the thread" }],
    stablePrefix: "You are a concise assistant.",
    sensitivity: "internal",
    maxOutputTokens: 1024,
    runContext: runContext(),
    budgetReservation: budgetReservation(),
    traceId: "trace-1",
    ...overrides,
  };
}

export function toolManifest(
  overrides: Record<string, unknown> = {},
): ToolManifest {
  return {
    schemaVersion: 1,
    toolId: "tool-1",
    toolVersion: "1.0.0",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
    outputSchema: { type: "object", properties: { result: { type: "string" } } },
    artifactDigest: SHA_A,
    publisherSignature: "s".repeat(128),
    requiredCapabilities: ["tools:search"],
    executionClass: "isolated",
    ...overrides,
  };
}

export function toolResultSucceeded(
  overrides: Record<string, unknown> = {},
): ToolResult {
  return {
    schemaVersion: 1,
    toolId: "tool-1",
    status: "succeeded",
    content: "search results",
    receiptId: "receipt-1",
    usage: { inputTokens: 1, outputTokens: 1 },
    ...overrides,
  };
}

export function memoryRecordGlobal(
  overrides: Record<string, unknown> = {},
): MemoryRecord {
  return {
    schemaVersion: 1,
    memoryId: "memory-1",
    tenantId: "tenant-1",
    scope: "Global",
    version: 1,
    value: "tenant supports SSO login",
    confidence: 0.9,
    sourceEpisodeIds: ["episode-1"],
    authority: "consolidation",
    sensitivity: "internal",
    ...overrides,
  };
}

export function compressionRecord(
  overrides: Record<string, unknown> = {},
): CompressionRecord {
  return {
    schemaVersion: 1,
    compressionId: "compression-1",
    sessionId: "session-1",
    parentGeneration: 0,
    sourceRange: { startIndex: 0, endIndex: 9 },
    sourceDigests: [SHA_A],
    prefixHash: SHA_B,
    summaryHash: SHA_C,
    modelVersion: "model-1",
    policyVersion: "policy-1",
    ...overrides,
  };
}

export function auditReceipt(
  overrides: Record<string, unknown> = {},
): AuditReceipt {
  return {
    schemaVersion: 1,
    receiptId: "receipt-1",
    tenantId: "tenant-1",
    sessionId: "session-1",
    runId: "run-1",
    effectId: "effect-1",
    sequence: 1,
    previousHash: SHA_A,
    inputHash: SHA_B,
    outputHash: SHA_C,
    status: "succeeded",
    mode: "assist",
    policyVersion: "policy-1",
    timestamp: RECEIVED_AT,
    keyId: "key-1",
    signature: "s".repeat(128),
    ...overrides,
  };
}

export function deliveryRecord(
  overrides: Record<string, unknown> = {},
): DeliveryRecord {
  return {
    schemaVersion: 1,
    deliveryId: "delivery-1",
    sessionId: "session-1",
    runId: "run-1",
    channel: "whatsapp",
    destinationIdentity: "whatsapp:+15550001111",
    contentHash: SHA_A,
    status: "pending",
    ...overrides,
  };
}

export function writerLease(
  overrides: Record<string, unknown> = {},
): WriterLease {
  return {
    sessionId: "session-1",
    runId: "run-1",
    writerEpoch: 1,
    expiresAt: FUTURE,
    ...overrides,
  };
}

export function checkpoint(
  overrides: Record<string, unknown> = {},
): Checkpoint {
  return {
    checkpointId: "checkpoint-1",
    runContext: runContext(),
    state: "{}",
    completedTaskIds: ["task-1"],
    completedEffectIds: ["effect-1"],
    modelResultRefs: ["result-1"],
    version: 1,
    ...overrides,
  };
}

export function episodeCommand(
  overrides: Record<string, unknown> = {},
): EpisodeCommand {
  return {
    schemaVersion: 1,
    commandId: "command-1",
    principal: principal(),
    runContext: runContext(),
    episodeId: "episode-1",
    kind: "user_message",
    content: "hello",
    sourceEventId: "event-1",
    ...overrides,
  };
}

export function appendReceipt(
  overrides: Record<string, unknown> = {},
): AppendReceipt {
  return {
    episodeId: "episode-1",
    commandId: "command-1",
    sequence: 1,
    contentHash: SHA_A,
    ...overrides,
  };
}

export function episode(overrides: Record<string, unknown> = {}): Episode {
  return {
    schemaVersion: 1,
    tenantId: "tenant-1",
    sessionId: "session-1",
    episodeId: "episode-1",
    sequence: 0,
    kind: "user_message",
    content: "hello",
    sourceIds: ["event-1"],
    createdAt: RECEIVED_AT,
    ...overrides,
  };
}

export function memoryQuery(
  overrides: Record<string, unknown> = {},
): MemoryQuery {
  return {
    schemaVersion: 1,
    query: { type: "text", text: "SSO login" },
    requestedScopes: ["Global"],
    limit: 10,
    runContext: runContext(),
    ...overrides,
  };
}

export function memoryWrite(
  overrides: Record<string, unknown> = {},
): MemoryWrite {
  return {
    schemaVersion: 1,
    record: memoryRecordGlobal(),
    runContext: runContext(),
    effectRequest: effectRequest(),
    sourceEpisodeIds: ["episode-1"],
    ...overrides,
  };
}

export function workerDescriptor(
  overrides: Record<string, unknown> = {},
): WorkerDescriptor {
  return {
    workerId: "worker-1",
    capabilities: ["tools:search"],
    health: "healthy",
    capacity: { active: 1, max: 4 },
    supportedTaskTypes: ["search"],
    ...overrides,
  };
}

export function normalizedError(
  overrides: Record<string, unknown> = {},
): NormalizedError {
  return {
    code: "INVALID_INPUT",
    safeMessage: "The request could not be parsed",
    retryable: false,
    ...overrides,
  };
}

export function modelResult(
  overrides: Record<string, unknown> = {},
): ModelResult {
  return {
    resultId: "result-1",
    outputRefs: [{ artifactId: "artifact-1", contentHash: SHA_A }],
    usageTokens: { inputTokens: 10, outputTokens: 5 },
    costMicroUsd: 250,
    providerModelRevision: "provider/model@rev-1",
    finishReason: "stop",
    ...overrides,
  };
}

export function skillManifest(
  overrides: Record<string, unknown> = {},
): SkillManifest {
  return {
    schemaVersion: 1,
    skillId: "skill-1",
    skillVersion: "1.0.0",
    publisherId: "publisher-1",
    publisherSignature: "s".repeat(128),
    artifactHash: SHA_A,
    requiredCapabilities: ["skills:search"],
    applicableTaskTypes: ["search"],
    scriptManifests: [toolManifest()],
    trustStatus: "trusted",
    ...overrides,
  };
}

export function consolidationPlan(
  overrides: Record<string, unknown> = {},
): ConsolidationPlan {
  return {
    schemaVersion: 1,
    planId: "plan-1",
    tenantId: "tenant-1",
    sourceEpisodeIds: ["episode-1"],
    sourceScopes: ["Global"],
    expectedMemoryVersions: { "memory-1": 1 },
    proposedRevisions: [],
    provenance: "consolidator-1",
    sensitivity: "internal",
    status: "draft",
    ...overrides,
  };
}

export function candidate(overrides: Record<string, unknown> = {}): Candidate {
  return {
    schemaVersion: 1,
    candidateId: "candidate-1",
    artifactHash: SHA_A,
    allowedChangedPaths: ["packages/skills/src/**"],
    schemaDigests: [SHA_B],
    policyDigests: [SHA_C],
    requestedPermissions: ["read:eval-cases"],
    status: "pending",
    ...overrides,
  };
}

export function evalReport(
  overrides: Record<string, unknown> = {},
): EvalReport {
  return {
    schemaVersion: 1,
    candidateId: "candidate-1",
    evaluatorVersion: "evaluator-1",
    caseSetDigests: [SHA_A],
    scores: { passRate: 0.95 },
    costMicroUsd: 1000,
    latencyMs: 500,
    governanceFailures: [],
    signedEvidenceRefs: ["evidence-1"],
    ...overrides,
  };
}

export function promotionDecision(
  overrides: Record<string, unknown> = {},
): PromotionDecision {
  return {
    schemaVersion: 1,
    candidateHash: SHA_A,
    artifactHash: SHA_B,
    reportHash: SHA_C,
    policyVersion: "policy-1",
    approverIds: ["approver-1"],
    expiresAt: FUTURE,
    decision: "promote",
    ...overrides,
  };
}

export function observation(
  overrides: Record<string, unknown> = {},
): Observation {
  return {
    tenantId: "tenant-1",
    scope: "Global",
    ownerId: "consolidator-1",
    entity: "user:subject-1",
    relation: "prefers",
    value: "concise answers",
    observedAt: RECEIVED_AT,
    validUntil: FUTURE,
    sourceIds: ["episode-1"],
    confidence: 0.8,
    revision: 1,
    ...overrides,
  };
}
