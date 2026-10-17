"use client";
import { useState } from "react";
import type { UiCommandResult } from "@asi/contracts";
import { handleManagementResult } from "../../lib/management";

export type ConnectionConnectCommand = { commandId: string; expectedRevision: number; type: "connection.connect"; connectionId: string };

export interface ConnectionFormProps {
  connectionId: string;
  expectedRevision: number;
  serverUrl?: string;
  submit: (command: ConnectionConnectCommand) => Promise<UiCommandResult>;
  onNavigate?: (href: string) => void;
}

export function ConnectionForm({ connectionId, expectedRevision, serverUrl, submit, onNavigate }: ConnectionFormProps) {
  const [url, setUrl] = useState(serverUrl ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await submit({ commandId: crypto.randomUUID(), expectedRevision, type: "connection.connect", connectionId });
      const outcome = handleManagementResult(result);
      if (outcome.kind === "navigate") { onNavigate?.(outcome.href); setMessage("An approval was requested in Chat."); }
      else if (outcome.kind === "applied") setMessage("Connection request recorded.");
      else setMessage(outcome.message);
    } catch {
      setMessage("Connection request unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const inputId = `server-url-${connectionId}`;
  return (
    <form className="connection-form" onSubmit={event => { event.preventDefault(); void connect(); }}>
      <label htmlFor={inputId}>Server URL</label>
      <input id={inputId} value={url} onChange={event => setUrl(event.target.value)} />
      <p className="connection-note">The backend performs DNS/SSRF/egress authorization. This page never contacts the entered URL directly.</p>
      <button type="submit" disabled={busy}>Connect</button>
      {message ? <p role="status" className="connection-status">{message}</p> : null}
    </form>
  );
}

export default ConnectionForm;
