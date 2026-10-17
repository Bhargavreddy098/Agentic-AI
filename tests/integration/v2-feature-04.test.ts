import { describe, it, expect } from "vitest";
import {
  ArtifactProvenanceSchema,
  EvidenceBackedOutputSchema,
  VerificationReportSchema,
  type BoundEvidenceClaim,
  type EvidenceSource,
  type GoalRecord,
  type RunContext,
} from "@asi/contracts";
import { verifyGoal, verificationOutcome, isGoalVerified } from "@asi/orchestrator";
import { traceMaterialClaims, createArtifactProvenance, computeArtifactProvenanceDigest } from "@asi/tools";

const SHA = "a".repeat(64);

function future(): string {
  return new Date(Date.now() + 3_600_000).toISOString();
}

function runContext(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run-1",
    sessionId: "session-1",
    writerEpoch: 1,
    mode: "execute",
    deadlineAt: future(),
    budgetRef: { tenantId: "tenant-a", accountId: "account-1", rootRunId: "root-1" },
    ...overrides,
  };
}

function goal(overrides: Partial<GoalRecord> = {}): GoalRecord {
  return {
    schemaVersion: 1,
    goalId: "goal-1",
    tenantId: "tenant-a",
    conversationId: "conversation-1",
    objective: "Produce a verified artifact",
    criteria: [{ criterionId: "criterion-1", description: "The artifact exists", evaluatorId: "eval-1", evidenceRequirement: "artifact", required: true }],
    constraintRefs: [],
    allowedResourceRefs: [],
    deadlineAt: future(),
    budgetRef: { tenantId: "tenant-a", accountId: "account-1", rootRunId: "root-1" },
    revision: 1,
    status: "running",
    ...overrides,
  };
}

function claim(overrides: Partial<BoundEvidenceClaim> = {}): BoundEvidenceClaim {
  return {
    schemaVersion: 1,
    claimId: "claim-1",
    text: "The artifact was produced.",
    sourceRefs: ["source-1"],
    observedAt: new Date().toISOString(),
    confidenceBasis: "measured",
    contradictionRefs: [],
    criterionRefs: ["criterion-1"],
    ...overrides,
  };
}

function source(overrides: Partial<EvidenceSource> = {}): EvidenceSource {
  return {
    sourceRef: "source-1",
    kind: "artifact",
    observedAt: new Date().toISOString(),
    supersedes: [],
    contradicts: [],
    ...overrides,
  };
}

describe("V2-F04 evidence-backed outputs: claim tracing", () => {
  it("traces each material claim distinctly, distinguishing unsupported assertions", () => {
    const traces = traceMaterialClaims(
      [
        claim({ claimId: "supported" }),
        claim({ claimId: "unsupported", sourceRefs: ["missing-source"] }),
        claim({ claimId: "conflicting", sourceRefs: ["source-1"], contradictionRefs: ["source-2"] }),
        claim({ claimId: "stale", sourceRefs: ["old-source"] }),
        claim({ claimId: "unknown", sourceRefs: ["source-1"], confidenceBasis: "unassessed" }),
      ],
      [source(), source({ sourceRef: "old-source", observedAt: "2020-01-01T00:00:00.000Z" })],
    );
    const byId = new Map(traces.map(trace => [trace.claimId, trace.status]));
    expect(byId.get("supported")).toBe("supported");
    expect(byId.get("unsupported")).toBe("unsupported");
    expect(byId.get("conflicting")).toBe("conflicting");
    expect(byId.get("stale")).toBe("stale");
    expect(byId.get("unknown")).toBe("unknown");
  });

  it("marks a claim stale when its source is superseded by a newer source", () => {
    const traces = traceMaterialClaims(
      [claim({ sourceRefs: ["source-1"] })],
      [source({ sourceRef: "source-1", observedAt: new Date().toISOString() }), source({ sourceRef: "source-2", supersedes: ["source-1"] })],
    );
    expect(traces[0]!.status).toBe("stale");
    expect(traces[0]!.staleSourceRefs).toContain("source-1");
  });
});

describe("V2-F04 evidence-backed outputs: goal verification", () => {
  it("keeps an unevidenced required criterion unknown, never satisfied", async () => {
    const report = await verifyGoal(goal(), [], runContext());
    expect(report.criterionResults).toHaveLength(1);
    expect(report.criterionResults[0]!.satisfied).toBeNull();
    expect(isGoalVerified(goal(), report)).toBe(false);
    expect(verificationOutcome(goal(), report)).toBe("unknown");
  });

  it("returns exactly one result per GoalSpec criterion", async () => {
    const subject = goal({
      criteria: [
        { criterionId: "criterion-1", description: "a", evaluatorId: "eval-1", evidenceRequirement: "artifact", required: true },
        { criterionId: "criterion-2", description: "b", evaluatorId: "eval-2", evidenceRequirement: "source", required: false },
      ],
    });
    const report = await verifyGoal(subject, [claim()], runContext());
    expect(report.criterionResults.map(result => result.criterionId).sort()).toEqual(["criterion-1", "criterion-2"]);
    expect(VerificationReportSchema.safeParse(report).success).toBe(true);
  });

  it("verifies the goal only when a required criterion is supported by fresh, non-conflicting evidence", async () => {
    const report = await verifyGoal(goal(), [claim()], runContext());
    expect(report.criterionResults[0]!.satisfied).toBe(true);
    expect(isGoalVerified(goal(), report)).toBe(true);
    expect(verificationOutcome(goal(), report)).toBe("verified");
  });

  it("never verifies a completed-looking output whose evidence conflicts", async () => {
    const report = await verifyGoal(goal(), [claim({ contradictionRefs: ["source-9"] })], runContext());
    expect(report.criterionResults[0]!.satisfied).toBe(false);
    expect(verificationOutcome(goal(), report)).toBe("unmet");
  });

  it("treats stale evidence as unmet rather than reverting to success", async () => {
    const report = await verifyGoal(goal(), [claim({ observedAt: "2020-01-01T00:00:00.000Z" })], runContext());
    expect(report.criterionResults[0]!.satisfied).toBe(false);
    expect(verificationOutcome(goal(), report)).toBe("unmet");
  });

  it("ignores evidence that references criteria outside the current GoalSpec", async () => {
    const report = await verifyGoal(goal(), [claim({ criterionRefs: ["ghost-criterion"] })], runContext());
    expect(report.criterionResults[0]!.satisfied).toBeNull();
    expect(verificationOutcome(goal(), report)).toBe("unknown");
  });

  it("binds the report to the exact evaluated inputs", async () => {
    const observedAt = "2026-10-17T00:00:00.000Z";
    const first = await verifyGoal(goal(), [claim({ observedAt })], runContext());
    const second = await verifyGoal(goal(), [claim({ observedAt })], runContext());
    expect(second.planDigest).toEqual(first.planDigest);
    expect(second.reportId).toBe(first.reportId);
    const changed = await verifyGoal(goal(), [claim({ observedAt, sourceRefs: ["source-2"] })], runContext());
    expect(changed.planDigest.value).not.toBe(first.planDigest.value);
  });
});

describe("V2-F04 evidence-backed outputs: artifact provenance", () => {
  it("binds provenance to the run and records author, version and confidence basis", () => {
    const provenance = createArtifactProvenance(
      { artifactId: "artifact-1", contentHash: SHA, mediaType: "text/plain", authorId: "specialist-1", authorVersion: "1.2.0", sourceRefs: ["source-1"], observedAt: new Date().toISOString(), confidenceBasis: "measured" },
      runContext(),
    );
    expect(ArtifactProvenanceSchema.safeParse(provenance).success).toBe(true);
    expect(provenance.authorVersion).toBe("1.2.0");
    expect(provenance.confidenceBasis).toBe("measured");
    const again = createArtifactProvenance(
      { artifactId: "artifact-1", contentHash: SHA, mediaType: "text/plain", authorId: "specialist-1", authorVersion: "1.2.0", sourceRefs: ["source-1"], observedAt: "2026-01-01T00:00:00.000Z", confidenceBasis: "measured" },
      runContext(),
    );
    expect(again.provenanceId).toBe(provenance.provenanceId);
    expect(computeArtifactProvenanceDigest(provenance).value).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects provenance with an invalid content hash", () => {
    expect(() => ArtifactProvenanceSchema.parse({ schemaVersion: 1, provenanceId: "p", artifactId: "a", contentHash: "not-a-hash", mediaType: "text/plain", authorId: "s", authorVersion: "1", sourceRefs: ["s"], claimRefs: [], observedAt: new Date().toISOString(), confidenceBasis: "measured", createdAt: new Date().toISOString() })).toThrow();
  });

  it("validates an evidence-backed output envelope", () => {
    const parsed = EvidenceBackedOutputSchema.safeParse({
      schemaVersion: 1,
      outputId: "output-1",
      goalId: "goal-1",
      goalRevision: 1,
      reportId: "report-1",
      outcome: "verified",
      claims: [claim()],
      provenance: [],
      limitations: [],
    });
    expect(parsed.success).toBe(true);
  });
});
