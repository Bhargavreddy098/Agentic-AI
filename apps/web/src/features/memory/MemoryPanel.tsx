"use client";
import { useEffect, useState } from "react";
import type { MemoryView, Page } from "@asi/contracts";
import type { GatewayClient } from "../../lib/gateway/client";
import { availableScopes, MEMORY_SCOPES, memoryLabels, searchMemory, type MemoryScope } from "./memory";
import { MemoryDetail } from "./MemoryDetail";

export function MemoryPanel({ workspaceId, client, authorizedScopes = [...MEMORY_SCOPES] }: {
  workspaceId: string;
  client: Pick<GatewayClient, "queryMemory">;
  authorizedScopes?: readonly MemoryScope[];
}) {
  const scopes = availableScopes(authorizedScopes);
  const [scope, setScope] = useState<MemoryScope>(scopes[0] ?? "Global");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<Page<MemoryView> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(null);
    setSelected(null);
    setError(null);
  }, [workspaceId]);

  async function run(cursor?: string) {
    setBusy(true);
    setError(null);
    try {
      const next = await searchMemory(client, { query, scope, cursor: cursor ?? undefined, limit: 20 });
      setPage(previous => cursor && previous ? { items: [...previous.items, ...next.items], nextCursor: next.nextCursor } : next);
    } catch {
      setError("Memory search unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const selectedMemory = page?.items.find(memory => memory.memoryId === selected) ?? null;

  return (
    <div className="memory-panel" data-testid="memory-panel" data-workspace={workspaceId}>
      <form className="memory-search" onSubmit={event => { event.preventDefault(); void run(); }}>
        <label htmlFor="memory-query">Search memory</label>
        <input id="memory-query" value={query} onChange={event => setQuery(event.target.value)} />
        <label htmlFor="memory-scope">Scope</label>
        <select id="memory-scope" value={scope} onChange={event => setScope(event.target.value as MemoryScope)}>
          {scopes.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
        <button type="submit" disabled={busy}>Search</button>
      </form>
      {error ? <p role="status" className="memory-error">{error}</p> : null}
      {page ? (page.items.length === 0 ? <p data-testid="memory-empty">No memory records matched.</p> : (
        <ul className="memory-list">
          {page.items.map(memory => (
            <li key={memory.memoryId} className="memory-row" data-testid={`memory-${memory.memoryId}`} data-scope={memory.scope} data-revision={memory.revision}>
              <button type="button" className="memory-open" onClick={() => setSelected(memory.memoryId)}>{memory.value}</button>
              <span className="memory-scope-label">{memory.scope}</span>
              {memoryLabels(memory).map(label => <span key={label} className="memory-label">{label}</span>)}
            </li>
          ))}
        </ul>
      )) : null}
      {page?.nextCursor ? <button type="button" className="memory-more" onClick={() => { void run(page.nextCursor ?? undefined); }} disabled={busy}>Load more</button> : null}
      {selectedMemory ? <MemoryDetail memory={selectedMemory} /> : null}
    </div>
  );
}

export default MemoryPanel;
