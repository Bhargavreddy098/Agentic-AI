"use client";

import { useState } from 'react';
import { parseCommand, pathParamsFor } from './parse';
import { buildBody } from './bodies';
import { createClient } from '@/lib/api/client';
import { beginOperation } from '@/lib/api/requirements';
import { useSession } from '@/lib/session/SessionProvider';

type Entry =
  | { kind: 'input'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'result'; status: number; ms: number; line: string; detail?: string; download?: { artifactId: string; bytes: number } }
  | { kind: 'err'; status?: number; ms?: number; text: string };

function summarize(data: unknown): { line: string; detail?: string } {
  if (data === null || data === undefined) return { line: '(no content)' };
  if (Array.isArray(data)) {
    if (!data.length) return { line: '0 records' };
    return { line: `${data.length} record${data.length === 1 ? '' : 's'}`, detail: JSON.stringify(data.slice(0, 3), null, 1) };
  }
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) return { line: `${obj.items.length} item${obj.items.length === 1 ? '' : 's'}`, detail: JSON.stringify(obj.items.slice(0, 3), null, 1) };
    const id = obj.id ?? obj.projectId ?? obj.operationId ?? obj.conversationId ?? obj.artifactId;
    const name = obj.name ?? obj.displayName ?? obj.title;
    const status = obj.status ?? obj.state;
    const parts = [id && `id ${String(id)}`, name && `${String(name)}`, status && `status ${String(status)}`].filter(Boolean);
    return { line: parts.length ? parts.join(' · ') : Object.keys(obj).slice(0, 6).join(', '), detail: JSON.stringify(obj, null, 1).slice(0, 1500) };
  }
  return { line: String(data) };
}

export function ConsolePane() {
  const [entries, setEntries] = useState<Entry[]>([
    { kind: 'note', text: 'Type help. Every command maps to one canonical /api/v1 route.' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useSession() as any;
  const csrf = session?.session?.csrfToken ?? null;

  function push(e: Entry) { setEntries(prev => [...prev, e]); }

  async function downloadArtifact(artifactId: string) {
    const client = createClient({ getCsrfToken: () => csrf });
    const route = { method: 'GET', path: '/artifacts/:artifactId/content', canonicalRoute: '/api/v1/artifacts/:artifactId/content', responseEnvelope: 'bytes', csrfRequired: false, idempotencyKeyRequired: false, ifMatchRequired: false } as any;
    const res: any = await client.request(route, { pathParams: { artifactId } });
    if (!res.ok) { push({ kind: 'err', text: `${res.problem.code} · ${res.problem.title}` }); return; }
    const bytes = res.data instanceof ArrayBuffer ? new Uint8Array(res.data) : (res.data as Uint8Array);
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${artifactId}.bin`; a.click();
    URL.revokeObjectURL(url);
    push({ kind: 'note', text: `downloaded ${bytes.byteLength} bytes` });
  }

  async function run() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    push({ kind: 'input', text });

    if (text === 'help' || text === '?') {
      push({ kind: 'note', text: 'Commands: health ready · list projects · create project "name" --kind greenfield · get project <id> · send message <id> --text "..." · patch budget <id> --limit-micro-usd 900 --reason "x" --if-match 1 · preview routing --task-type planning --capabilities text.completion --classification internal' });
      return;
    }

    const parsed = parseCommand(text);
    if (!parsed.ok) { push({ kind: 'err', text: parsed.error }); return; }

    const built = buildBody(parsed.route, parsed.positional, parsed.flags);
    if (built && 'error' in built) { push({ kind: 'err', text: built.error }); return; }

    const client = createClient({ getCsrfToken: () => csrf, onUnauthorized: () => session?.handleUnauthorized?.() });
    const op = beginOperation(parsed.route);
    const pathParams = pathParamsFor(parsed.route, parsed.positional);
    const ifMatch = parsed.flags['if-match'];

    setBusy(true);
    const t0 = performance.now();
    const opts: any = { pathParams, ifMatch, operation: op };
    if (built.kind === 'json') opts.body = built.body;
    if (built.kind === 'bytes') opts.rawBody = built.bytes;

    const res: any = await client.request(parsed.route, opts);
    const ms = Math.round(performance.now() - t0);
    setBusy(false);

    if (!res.ok) {
      push({ kind: 'err', status: res.problem.status, ms, text: `${res.problem.code} · ${res.problem.title}${res.problem.detail ? ` — ${res.problem.detail}` : ''}` });
      return;
    }

    const line = `${parsed.route.method} ${parsed.route.canonicalRoute}`;
    if (parsed.route.responseEnvelope === 'bytes') {
      push({ kind: 'result', status: res.status, ms, line: `${line} → raw bytes` });
      const artifactId = pathParams.artifactId;
      if (artifactId && typeof window !== 'undefined') {
        push({ kind: 'result', status: res.status, ms: 0, line: '', download: { artifactId, bytes: (res.data?.byteLength ?? 0) } });
      }
      return;
    }

    const s = summarize(res.data);
    push({ kind: 'result', status: res.status, ms, line: `${line} → ${res.status} · ${s.line}`, detail: s.detail });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-auto p-2 text-xs font-mono space-y-2">
        {entries.map((en, i) => {
          if (en.kind === 'input') return <div key={i} className="text-foreground">{'> '}{en.text}</div>;
          if (en.kind === 'note') return <div key={i} className="opacity-60">{en.text}</div>;
          if (en.kind === 'err') return <div key={i} className="text-red-500">{en.status ? `[${en.status}] ` : ''}{en.text}{en.ms !== undefined ? ` (${en.ms}ms)` : ''}</div>;
          return (
            <div key={i} className="text-muted-foreground">
              {en.line && <div>{en.line}{en.ms ? ` (${en.ms}ms)` : ''}</div>}
              {en.download && (
                <button className="underline text-left" onClick={() => void downloadArtifact(en.download!.artifactId)}>
                  download {en.download.bytes} bytes
                </button>
              )}
              {en.detail && <pre className="whitespace-pre-wrap opacity-80 mt-1 text-[11px]">{en.detail}</pre>}
            </div>
          );
        })}
      </div>
      <div className="border-t p-2 flex gap-2 shrink-0">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void run(); }}
          className="flex-1 border px-2 py-1 text-xs font-mono bg-transparent"
          placeholder="command…  e.g. list projects"
          disabled={busy}
        />
        <button onClick={() => void run()} disabled={busy} className="border px-2 text-xs">{busy ? '…' : 'Run'}</button>
      </div>
    </div>
  );
}
