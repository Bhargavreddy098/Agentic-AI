import { createHash } from "node:crypto";
import {
  BoundEvidenceClaimSchema,
  GoalRecordSchema,
  VerificationReportSchema,
  type BoundEvidenceClaim,
  type CriterionResult,
  type EvidenceClaim,
  type EvidenceSource,
  type GoalRecord,
  type RunContext,
  type VerificationOutcome,
  type VerificationReport,
} from "@asi/contracts";
import { traceMaterialClaims } from "@asi/tools";

export const VERIFIER_ID = "verifier-evidence-backed-outputs";
export const VERIFIER_VERSION = "1";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

function bind(evidence: EvidenceClaim[]): BoundEvidenceClaim[] {
  return evidence.map(item => {
    const criterionRefs = (item as { criterionRefs?: string[] }).criterionRefs ?? [];
    return BoundEvidenceClaimSchema.parse({ ...item, criterionRefs });
  });
}

function sourcesFrom(claims: BoundEvidenceClaim[]): EvidenceSource[] {
  const sources: EvidenceSource[] = [];
  for (const claim of claims) {
    for (const ref of claim.sourceRefs) {
      sources.push({
        sourceRef: ref,
        kind: "source",
        observedAt: claim.observedAt,
        supersedes: [],
        contradicts: claim.contradictionRefs ?? [],
      });
    }
  }
  return sources;
}

export async function verifyGoal(goal: GoalRecord, evidence: EvidenceClaim[], context: RunContext): Promise<VerificationReport> {
  const record = GoalRecordSchema.parse(goal);
  const claims = bind(evidence);
  const traces = traceMaterialClaims(claims, sourcesFrom(claims));
  const tracesByClaim = new Map(traces.map(trace => [trace.claimId, trace] as const));

  const criterionResults: CriterionResult[] = record.criteria.map(criterion => {
    const criterionClaims = claims.filter(claim => claim.criterionRefs.includes(criterion.criterionId));
    if (criterionClaims.length === 0) {
      return {
        criterionId: criterion.criterionId,
        satisfied: null,
        evidenceRefs: [],
        safeReason: "No evidence was provided for this criterion; it remains unknown.",
      };
    }

    const claimTraces = criterionClaims.map(claim => tracesByClaim.get(claim.claimId)!);
    const supported = claimTraces.filter(trace => trace.status === "supported");
    const evidenceRefs = [...new Set(supported.flatMap(trace => trace.supportingSourceRefs))].slice(0, 64);

    if (supported.length > 0) {
      return {
        criterionId: criterion.criterionId,
        satisfied: true,
        evidenceRefs,
        safeReason: "At least one fresh, non-conflicting claim supports this criterion.",
      };
    }

    const blocked = claimTraces.some(trace => trace.status === "conflicting" || trace.status === "stale" || trace.status === "unsupported");
    if (blocked) {
      const conflicted = claimTraces.some(trace => trace.status === "conflicting");
      const stale = claimTraces.some(trace => trace.status === "stale");
      return {
        criterionId: criterion.criterionId,
        satisfied: false,
        evidenceRefs: [],
        safeReason: conflicted
          ? "Evidence for this criterion is conflicting; the criterion is not satisfied."
          : stale
            ? "Evidence for this criterion is stale or superseded; the criterion is not satisfied."
            : "The asserted evidence is unsupported; the criterion is not satisfied.",
      };
    }

    return {
      criterionId: criterion.criterionId,
      satisfied: null,
      evidenceRefs: [],
      safeReason: "Evidence exists but carries no assessed confidence; the criterion remains unknown.",
    };
  });

  const planDigest = {
    algorithm: "sha256" as const,
    value: sha256(canonical({
      kind: "evidence-backed-outputs-binding",
      goalId: record.goalId,
      goalRevision: record.revision,
      runId: context.runId,
      criteria: [...record.criteria.map(criterion => criterion.criterionId)].sort(),
      evidence: [...claims].sort((a, b) => a.claimId.localeCompare(b.claimId)),
    })),
  };
  const artifactDigests = [...new Set(claims.map(claim => sha256(canonical([...claim.sourceRefs].sort()))))]
    .slice(0, 256)
    .map(value => ({ algorithm: "sha256" as const, value }));

  return VerificationReportSchema.parse({
    schemaVersion: 1,
    reportId: `report-${sha256(`${record.goalId}\u0000${record.revision}\u0000${planDigest.value}`).slice(0, 32)}`,
    goalId: record.goalId,
    goalRevision: record.revision,
    planDigest,
    artifactDigests,
    criterionResults,
    verifierId: VERIFIER_ID,
    verifierVersion: VERIFIER_VERSION,
    checkedAt: new Date().toISOString(),
  });
}

export function verificationOutcome(goal: GoalRecord, report: VerificationReport): VerificationOutcome {
  if (report.goalId !== goal.goalId || report.goalRevision !== goal.revision) return "unknown";
  const byCriterion = new Map(report.criterionResults.map(result => [result.criterionId, result] as const));
  let unknown = false;
  for (const criterion of goal.criteria) {
    if (!criterion.required) continue;
    const result = byCriterion.get(criterion.criterionId);
    if (!result || result.satisfied === null) unknown = true;
    else if (!result.satisfied) return "unmet";
  }
  return unknown ? "unknown" : "verified";
}

export function isGoalVerified(goal: GoalRecord, report: VerificationReport): boolean {
  return verificationOutcome(goal, report) === "verified";
}
