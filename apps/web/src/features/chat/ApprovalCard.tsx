"use client";
import { useEffect, useRef, useState } from "react";
import { ApprovalDecisionInputSchema, type ApprovalDecisionInput, type UiApprovalRequest, type UiCommandResult } from "@asi/contracts";

export interface ApprovalCardProps {
  approval: UiApprovalRequest;
  onDecide: (approvalId: string, input: ApprovalDecisionInput) => Promise<UiCommandResult>;
  refreshStatus?: () => Promise<UiApprovalRequest | null>;
  onChanged?: () => void;
  now?: () => number;
}

export function isApprovalExpired(approval: UiApprovalRequest, at: number): boolean {
  return approval.status === "pending" && Date.parse(approval.expiresAt) <= at;
}

export function ApprovalCard({ approval, onDecide, refreshStatus, onChanged, now = Date.now }: ApprovalCardProps) {
  const [phase, setPhase] = useState<"idle" | "submitting" | "decided">("idle");
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => now());
  const commandRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const approvalRef = useRef(approval.approvalId);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (approvalRef.current !== approval.approvalId) approvalRef.current = approval.approvalId;
    setError(null);
    commandRef.current = null;
    if (approval.status !== "pending") setPhase("idle");
  }, [approval.approvalId, approval.version, approval.status]);

  useEffect(() => {
    if (approval.status !== "pending") return;
    const remaining = Date.parse(approval.expiresAt) - now();
    if (remaining <= 0) { setClock(now()); return; }
    const timer = setTimeout(() => setClock(now()), remaining + 1);
    return () => clearTimeout(timer);
  }, [approval.status, approval.expiresAt, now]);

  const expired = isApprovalExpired(approval, clock);
  const readOnly = approval.status !== "pending" || expired || phase === "decided";

  const statusText = approval.status !== "pending" ? ({
    approved: "Approved (historical record).",
    rejected: "Rejected (historical record).",
    expired: "This proposal expired.",
    cancelled: "This proposal was cancelled.",
    pending: ""
  })[approval.status] : expired ? "This proposal expired and is read-only." : phase === "submitting" ? "Recording the decision…" : phase === "decided" ? "Decision recorded; awaiting the run." : "Awaiting your decision.";

  async function decide(value: "approve" | "reject") {
    if (readOnly || busyRef.current) return;
    busyRef.current = true;
    const commandId = commandRef.current ?? crypto.randomUUID();
    commandRef.current = commandId;
    setPhase("submitting"); setError(null);
    try {
      const input = ApprovalDecisionInputSchema.parse({ commandId, expectedVersion: approval.version, decision: value });
      const result = await onDecide(approval.approvalId, input);
      if (!mounted.current) return;
      if (result.status === "applied") setPhase("decided");
      else if (result.status === "conflict") { setPhase("idle"); commandRef.current = null; setError("This proposal changed; the latest version is shown."); onChanged?.(); }
      else if (result.status === "rejected") { setPhase("idle"); setError(result.error.safeMessage); }
      else { setPhase("idle"); setError("The backend did not accept this decision; review the proposal."); }
    } catch {
      try { await refreshStatus?.(); } catch { /* the retry still reuses the same command identity */ }
      if (mounted.current) { setPhase("idle"); setError("Status refreshed; retry submits the same decision."); }
    } finally { busyRef.current = false; }
  }

  const titleId = `approval-action-${approval.approvalId}`;
  return <section className="approval-card" data-testid={`approval-${approval.approvalId}`} data-status={approval.status !== "pending" ? approval.status : expired ? "expired" : phase === "decided" ? "decided" : phase} aria-labelledby={titleId}>
    <fieldset disabled={readOnly}>
      <legend id={titleId}>{approval.action}</legend>
      <dl className="approval-details">
        <div><dt>Target</dt><dd>{approval.target}</dd></div>
        <div><dt>Change preview</dt><dd>{approval.preview}</dd></div>
        <div><dt>Required role</dt><dd>{approval.requiredActorRole}</dd></div>
        <div><dt>Expires</dt><dd>{approval.expiresAt}</dd></div>
      </dl>
      <p role="status" aria-live="polite" data-testid="approval-status">{statusText}</p>
      {error ? <p role="alert" className="approval-error">{error}</p> : null}
      {!readOnly ? <div className="approval-controls">
        <button type="button" onClick={() => void decide("approve")} disabled={phase === "submitting"}>Approve once</button>
        <button type="button" onClick={() => void decide("reject")} disabled={phase === "submitting"}>Reject</button>
      </div> : null}
    </fieldset>
  </section>;
}
export default ApprovalCard;
