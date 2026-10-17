"use client";
import { useEffect, useRef, useState } from "react";
import { ClarificationAnswerSchema, type ClarificationAnswer, type ClarificationRequest, type UiCommandResult } from "@asi/contracts";

export interface ClarificationCardProps {
  question: ClarificationRequest;
  onSubmit: (questionId: string, answer: ClarificationAnswer) => Promise<UiCommandResult>;
  onConflict?: () => void;
  now?: () => number;
}

export const FREE_TEXT_LIMIT = 4096;

export function isExpired(question: ClarificationRequest, at: number): boolean {
  return question.status === "pending" && question.expiresAt !== undefined && Date.parse(question.expiresAt) <= at;
}

export function validateAnswer(question: ClarificationRequest, selected: string[], text: string): string | null {
  const allowed = new Set(question.options.map(option => option.optionId));
  const optionIds = selected.filter(optionId => allowed.has(optionId));
  const value = text.trim();
  if (value.length > FREE_TEXT_LIMIT) return "Free-text answers are limited to 4096 characters.";
  if (!question.allowFreeText && value.length > 0) return "This question does not accept additional text.";
  if (!question.allowMultiple && optionIds.length > 1) return "Select only one option.";
  if (optionIds.length === 0 && value.length === 0) return question.required ? "This question requires an answer before you can submit." : "Choose an option or provide an answer before you submit.";
  return null;
}

export function ClarificationCard({ question, onSubmit, onConflict, now = Date.now }: ClarificationCardProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted">("idle");
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => now());
  const commandRef = useRef<string | null>(null);
  const questionRef = useRef(question.questionId);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (questionRef.current !== question.questionId) { questionRef.current = question.questionId; setSelected([]); setText(""); }
    else setSelected(previous => previous.filter(optionId => question.options.some(option => option.optionId === optionId)));
    setError(null);
    commandRef.current = null;
    if (question.status !== "pending") setPhase("idle");
  }, [question.questionId, question.version, question.status, question.options]);

  useEffect(() => {
    if (question.status !== "pending" || question.expiresAt === undefined) return;
    const remaining = Date.parse(question.expiresAt) - now();
    if (remaining <= 0) { setClock(now()); return; }
    const timer = setTimeout(() => setClock(now()), remaining + 1);
    return () => clearTimeout(timer);
  }, [question.status, question.expiresAt, now]);

  const expired = isExpired(question, clock);
  const readOnly = question.status !== "pending" || expired || phase === "submitted";
  const validation = validateAnswer(question, selected, text);
  const freeTextLabel = question.options.length === 0 || question.allowMultiple ? "Your answer" : "Additional answer";

  const statusText = question.status !== "pending" ? ({
    answered: "This question has been answered and is read-only.",
    expired: "This question expired before it was answered.",
    cancelled: "This question was cancelled.",
    pending: ""
  })[question.status] : expired ? "This question expired before it was answered." : phase === "submitting" ? "Submitting your answer…" : phase === "submitted" ? "Answer recorded." : question.required ? "Waiting for your answer. This question requires a response." : "Waiting for your answer.";

  function toggle(optionId: string) {
    setError(null);
    setSelected(previous => previous.includes(optionId) ? previous.filter(value => value !== optionId) : question.allowMultiple ? [...previous, optionId] : [optionId]);
  }

  async function submit() {
    const message = validateAnswer(question, selected, text);
    if (message) { setError(message); return; }
    const allowed = new Set(question.options.map(option => option.optionId));
    const optionIds = selected.filter(optionId => allowed.has(optionId));
    const value = text.trim();
    const commandId = commandRef.current ?? crypto.randomUUID();
    commandRef.current = commandId;
    let answer: ClarificationAnswer;
    try { answer = ClarificationAnswerSchema.parse({ commandId, expectedVersion: question.version, optionIds, ...(value ? { text: value } : {}) }); }
    catch { setError("This answer is not valid for the question."); return; }
    setPhase("submitting"); setError(null);
    try {
      const result = await onSubmit(question.questionId, answer);
      if (!mounted.current) return;
      if (result.status === "applied") setPhase("submitted");
      else if (result.status === "conflict") { setPhase("idle"); commandRef.current = null; setError("This question changed; the latest version is shown."); onConflict?.(); }
      else if (result.status === "rejected") { setPhase("idle"); setError(result.error.safeMessage); }
      else { setPhase("idle"); setError("The backend did not accept this answer; review the question and try again."); }
    } catch {
      if (mounted.current) { setPhase("idle"); setError("Response unavailable. Retry to submit the same answer."); }
    }
  }

  const promptId = `clarification-prompt-${question.questionId}`;
  return <section className="clarification-card" data-testid={`clarification-${question.questionId}`} data-status={question.status !== "pending" ? question.status : expired ? "expired" : phase === "submitted" ? "answered" : phase} aria-labelledby={promptId}>
    <fieldset disabled={readOnly}>
      <legend id={promptId}>{question.prompt}</legend>
      <p role="status" aria-live="polite" data-testid="clarification-status">{statusText}</p>
      {error ? <p role="alert" className="clarification-error">{error}</p> : null}
      {question.options.length > 0 ? <div className="clarification-options">
        {question.options.map(option => {
          const inputId = `${question.questionId}-option-${option.optionId}`;
          return <label key={option.optionId} htmlFor={inputId}>
            <input id={inputId} name={`clarification-${question.questionId}`} type={question.allowMultiple ? "checkbox" : "radio"} value={option.optionId} checked={selected.includes(option.optionId)} onChange={() => toggle(option.optionId)} />
            {option.label}
          </label>;
        })}
      </div> : null}
      {question.allowFreeText ? <div className="clarification-free-text">
        <label htmlFor={`${question.questionId}-free-text`}>{freeTextLabel}</label>
        <textarea id={`${question.questionId}-free-text`} value={text} maxLength={FREE_TEXT_LIMIT} onChange={event => { setError(null); setText(event.target.value); }} />
      </div> : null}
      {!readOnly ? <button type="button" onClick={submit} disabled={phase === "submitting" || validation !== null}>{phase === "submitting" ? "Submitting answer" : "Submit answer"}</button> : null}
    </fieldset>
  </section>;
}
export default ClarificationCard;
