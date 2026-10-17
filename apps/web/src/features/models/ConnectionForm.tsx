"use client";
import { useRef, useState } from "react";
import type { UiCommandResult } from "@asi/contracts";
import { handleManagementResult } from "../../lib/management";

export type ProviderConnectCommand = { commandId: string; expectedRevision: number; type: "provider.connect"; providerId: string; credential: string };

export interface ConnectionFormProps {
  mode: "demo" | "live";
  providerId: string;
  submit: (command: ProviderConnectCommand) => Promise<UiCommandResult>;
  onNavigate?: (href: string) => void;
}

export function ConnectionForm({ mode, providerId, submit, onNavigate }: ConnectionFormProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    const credential = inputRef.current?.value ?? "";
    if (!credential || busy) return;
    setBusy(true);
    try {
      const result = await submit({ commandId: crypto.randomUUID(), expectedRevision: 0, type: "provider.connect", providerId, credential });
      const outcome = handleManagementResult(result);
      if (outcome.kind === "navigate") { onNavigate?.(outcome.href); setMessage("An approval was requested in Chat."); }
      else if (outcome.kind === "applied") setMessage("Provider connected.");
      else setMessage(outcome.message);
    } catch {
      setMessage("Connection request unavailable; the credential was discarded.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
      setBusy(false);
    }
  }

  const inputId = `provider-key-${providerId}`;
  return (
    <form className="connection-form" onSubmit={event => { event.preventDefault(); void connect(); }}>
      <p className="credential-mode">{mode === "demo" ? "Demo mode: the credential is a synthetic value and no real provider is contacted." : "Live mode: the credential is sent only to the protected Gateway and is never stored in the browser."}</p>
      <label htmlFor={inputId}>Provider key</label>
      <input id={inputId} ref={inputRef} type="password" name="provider-key" autoComplete="off" spellCheck={false} />
      <button type="submit" disabled={busy}>Connect provider</button>
      {message ? <p role="status" className="connection-status">{message}</p> : null}
    </form>
  );
}

export default ConnectionForm;
