import { createHash } from "node:crypto";
import {
  ArtifactProvenanceSchema,
  ClaimTraceSchema,
  type ArtifactProvenance,
  type BoundEvidenceClaim,
  type ClaimTrace,
  type ClaimTraceStatus,
  type EvidenceSource,
  type RunContext,
} from "@asi/contracts";

export const DEFAULT_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ArtifactProvenanceInput {
  artifactId: string;
  contentHash: string;
  mediaType: string;
  authorId: string;
  authorVersion: string;
  sourceRefs: string[];
  claimRefs?: string[];
  observedAt: string;
  verifiedAt?: string;
  confidenceBasis: "measured" | "heuristic" | "unassessed";
}

export interface ClaimTraceOptions {
  now?: string;
  maxAgeMs?: number;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createArtifactProvenance(input: ArtifactProvenanceInput, context: RunContext): ArtifactProvenance {
  const provenanceId = `provenance-${sha256(`${context.runId}\u0000${input.artifactId}\u0000${input.contentHash}`).slice(0, 32)}`;
  return ArtifactProvenanceSchema.parse({
    schemaVersion: 1,
    provenanceId,
    artifactId: input.artifactId,
    contentHash: input.contentHash,
    mediaType: input.mediaType,
    authorId: input.authorId,
    authorVersion: input.authorVersion,
    sourceRefs: input.sourceRefs,
    claimRefs: input.claimRefs ?? [],
    observedAt: input.observedAt,
    ...(input.verifiedAt ? { verifiedAt: input.verifiedAt } : {}),
    confidenceBasis: input.confidenceBasis,
    createdAt: input.observedAt,
  });
}

export function computeArtifactProvenanceDigest(provenance: ArtifactProvenance): { algorithm: "sha256"; value: string } {
  const canonical = JSON.stringify(provenance, Object.keys(provenance).sort());
  return { algorithm: "sha256", value: sha256(canonical) };
}

export function traceMaterialClaims(claims: BoundEvidenceClaim[], sources: EvidenceSource[], options: ClaimTraceOptions = {}): ClaimTrace[] {
  const nowMs = options.now ? Date.parse(options.now) : Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_FRESHNESS_WINDOW_MS;
  const byRef = new Map(sources.map(source => [source.sourceRef, source] as const));
  const supersededRefs = new Set(sources.flatMap(source => source.supersedes ?? []));

  return claims.map(claim => {
    const resolved: EvidenceSource[] = [];
    const missing: string[] = [];
    for (const ref of claim.sourceRefs) {
      const source = byRef.get(ref);
      if (source) resolved.push(source);
      else missing.push(ref);
    }

    const conflictingSourceRefs: string[] = [];
    const staleSourceRefs: string[] = [];
    const supportingSourceRefs: string[] = [];
    for (const source of resolved) {
      if ((source.contradicts?.length ?? 0) > 0) {
        conflictingSourceRefs.push(source.sourceRef);
        continue;
      }
      const age = nowMs - Date.parse(source.observedAt);
      const superseded = supersededRefs.has(source.sourceRef);
      if (age > maxAgeMs || superseded) {
        staleSourceRefs.push(source.sourceRef);
        continue;
      }
      supportingSourceRefs.push(source.sourceRef);
    }

    const hasContradiction = (claim.contradictionRefs?.length ?? 0) > 0 || conflictingSourceRefs.length > 0;
    const status: ClaimTraceStatus = hasContradiction
      ? "conflicting"
      : resolved.length === 0
        ? "unsupported"
        : staleSourceRefs.length > 0 && supportingSourceRefs.length === 0
          ? "stale"
          : claim.confidenceBasis === "unassessed"
            ? "unknown"
            : missing.length > 0 && supportingSourceRefs.length > 0
              ? "unknown"
              : "supported";

    const safeReason = hasContradiction
      ? "The claim is contradicted by declared contradiction or conflicting sources."
      : status === "unsupported"
        ? "No provided source resolves the claim; the assertion is unsupported."
        : status === "stale"
          ? "Every resolvable source for the claim is stale or superseded."
          : status === "unknown"
            ? claim.confidenceBasis === "unassessed"
              ? "The claim carries no assessed confidence basis."
              : "Some referenced sources could not be resolved, so support is partial."
            : "The claim is supported by a fresh, non-conflicting source.";

    return ClaimTraceSchema.parse({
      claimId: claim.claimId,
      status,
      supportingSourceRefs,
      conflictingSourceRefs,
      staleSourceRefs,
      safeReason,
    });
  });
}
