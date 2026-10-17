"use client";
import { useRef, useState } from "react";
import type { MemoryView, UiCommandResult } from "@asi/contracts";

export type MemoryCorrectInput = { memoryId: string; value: string; expectedRevision: number };

export interface MemoryCorrectionFormProps {
  memory: MemoryView;
  submit: (input: MemoryCorrectInput) => Promise<UiCommandResult>;
  onRefresh?: () => void;
  onNavigate?: (href: string) => void;
}

export function MemoryCorrectionForm({ memory, submit, onRefresh, onNavigate }: MemoryCorrectionFormProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = inputRef.current?.value ?? "";
    if (!value.trim() || busy) return;
    setBusy(true);
    try {
      const result = await submit({ memoryId: memory.memoryId, value, expectedRevision: memory.revision });
      if (result.status === "approval_required") { onNavigate?.(`/chat/${result.conversationId}?interaction=${result.interactionId}`); setMessage("An approval was requested in Chat."); }
      else if (result.status === "applied") { onRefresh?.(); setMessage("Correction recorded."); }
      else { onRefresh?.(); setMessage(result.error.safeMessage); }
    } catch {
      setMessage("Correction unavailable.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="memory-correction" data-testid={`memory-correction-${memory.memoryId}`} onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="memory-current" data-testid="memory-current-value">{memory.value}</p>
      <label htmlFor={`memory-correction-value-${memory.memoryId}`}>Corrected value</label>
      <textarea id={`memory-correction-value-${memory.memoryId}`} ref={inputRef} rows={3} />
      <button type="submit" disabled={busy}>Save correction</button>
      {message ? <p role="status" className="memory-correction-status">{message}</p> : null}
    </form>
  );
}

export default MemoryCorrectionForm;
