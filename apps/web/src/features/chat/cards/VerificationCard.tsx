"use client";
import type { VerificationView } from "@asi/contracts";
import { formatDate } from "../../../lib/utils/date";

const STATUS_LABELS: Record<VerificationView["status"], string> = {
  verified: "Verified",
  unmet: "Unmet",
  partial: "Partially verified",
  unknown: "Unknown",
};

function resultLabel(satisfied: boolean | null): string {
  if (satisfied === true) return "Satisfied";
  if (satisfied === false) return "Not satisfied";
  return "Not determined";
}

export function VerificationCard({ verification, className }: { verification: VerificationView; className?: string }) {
  const titleId = `verification-title-${verification.reportId}`;
  return <section className={className ? `verification-card ${className}` : "verification-card"} data-testid={`verification-${verification.reportId}`} data-status={verification.status} data-goal-id={verification.goalId} data-run-id={verification.runId} aria-labelledby={titleId}>
    <h3 id={titleId}>Verification</h3>
    <p className="verification-status" role="status" aria-live="polite">{STATUS_LABELS[verification.status]}</p>
    <ul className="verification-criteria">
      {verification.criterionResults.map(result => <li key={result.criterionId} data-criterion-id={result.criterionId} data-satisfied={result.satisfied === null ? "unknown" : String(result.satisfied)}>
        <span className="verification-criterion-id">{result.criterionId}</span>
        <span className="verification-criterion-result">{resultLabel(result.satisfied)}</span>
        <span className="verification-criterion-reason">{result.safeReason}</span>
        {result.evidenceRefs.length > 0 ? <span className="verification-criterion-evidence">Evidence: {result.evidenceRefs.join(", ")}</span> : null}
      </li>)}
    </ul>
    <p className="verification-checked-at">Checked {formatDate(verification.checkedAt)}</p>
    {verification.limitations.length > 0 ? <ul className="verification-limitations">{verification.limitations.map((limitation, index) => <li key={`${verification.reportId}-limitation-${index}`}>{limitation}</li>)}</ul> : null}
  </section>;
}
export default VerificationCard;
