"use client";

import { useState } from 'react';
import { parseCommand, pathParamsFor } from './parse';
import { buildBody } from './bodies';
import { buildQuery } from './query';
import { COMMANDS } from './grammar';
import { uploadFile } from '@/lib/api/upload';
import { createClient, type RequestOptions } from '@/lib/api/client';
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
    { kind: 'note', text: 'Type help to see every supported command. Commands map to canonical backend routes.' }
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProject, setUploadProject] = useState('');
  const session = useSession();
  const csrf = session?.session?.csrfToken ?? null;

  function push(e: Entry) { setEntries(prev => [...prev, e]); }

  async function downloadArtifact(artifactId: string) {
    const client = createClient({ getCsrfToken: () => csrf });
    const route = { method: 'GET', path: '/artifacts/:artifactId/content', canonicalRoute: '/api/v1/artifacts/:artifactId/content', responseEnvelope: 'bytes', csrfRequired: false, idempotencyKeyRequired: false, ifMatchRequired: false } as import('@/lib/api/types').ApiRoute;
    const res = await client.request<ArrayBuffer>(route, { pathParams: { artifactId } });
    if (!res.ok) { push({ kind: 'err', text: `${res.problem.code} · ${res.problem.title}` }); return; }
    const bytes = new Uint8Array(res.data);
    const blob = new Blob([res.data], { type: 'application/octet-stream' });
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
    push({ kind: 'input', text: text.startsWith('connect session') ? 'connect session [redacted]' : text });

    if (text === 'help' || text === '?') {
      push({ kind: 'note', text: COMMANDS.map(command => command.name + (command.positional ? ' <id or value>' : '') + ' ' + command.flags.map(flag=>'--'+flag).join(' ')).join('\n') });
      return;
    }

    const parsed = parseCommand(text);
    if (!parsed.ok) { push({ kind: 'err', text: parsed.error }); return; }

    let selectedBytes: Uint8Array | undefined;
    if (parsed.route.method === 'PUT') {
      if (!file || file.size > 16777216) { push({kind:'err',text:'Choose a real file of at most 16 MiB.'}); return; }
      selectedBytes = new Uint8Array(await file.arrayBuffer());
    }
    const built = buildBody(parsed.route, parsed.positional, parsed.flags, selectedBytes);
    if (built && 'error' in built) { push({ kind: 'err', text: built.error }); return; }

    const client = createClient({ getCsrfToken: () => csrf, onUnauthorized: () => session?.handleUnauthorized?.() });
    const op = beginOperation(parsed.route);
    const pathParams = pathParamsFor(parsed.route, parsed.positional);
    const ifMatch = parsed.flags['if-match'];

    setBusy(true);
    const t0 = performance.now();
    const opts: RequestOptions = { pathParams, ifMatch, operation: op, query: buildQuery(parsed.route, parsed.flags) };
    if (built.kind === 'json') opts.body = built.body;
    if (built.kind === 'bytes') opts.rawBody = built.bytes;

    const res = await client.request<unknown>(parsed.route, opts);
    const ms = Math.round(performance.now() - t0);
    setBusy(false);

    if (!res.ok) {
      push({ kind: 'err', status: res.problem.status, ms, text: `${res.problem.code} · ${res.problem.title}${res.problem.detail ? ` — ${res.problem.detail}` : ''}` });
      return;
    }

    if (parsed.route.path === '/session' && parsed.route.method === 'DELETE') session.handleUnauthorized();
    if (parsed.route.path === '/session/bootstrap') await session.recover();
    if (parsed.route.method !== 'GET') window.dispatchEvent(new Event('asi:records-changed'));
    if (res.meta?.nextCursor) push({kind:'note',text:'Next cursor: '+res.meta.nextCursor});
    const line = `${parsed.route.method} ${parsed.route.canonicalRoute}`;
    if (parsed.route.responseEnvelope === 'bytes') {
      push({ kind: 'result', status: res.status, ms, line: `${line} → raw bytes` });
      const artifactId = pathParams.artifactId;
      if (artifactId && typeof window !== 'undefined') {
        push({ kind: 'result', status: res.status, ms: 0, line: '', download: { artifactId, bytes: (res.data instanceof ArrayBuffer ? res.data.byteLength : 0) } });
      }
      return;
    }

    const s = summarize(res.data);
    push({ kind: 'result', status: res.status, ms, line: `${line} → ${res.status} · ${s.line}`, detail: s.detail });
  }

  async function uploadSelected() {
    if (!file || busy) return;
    setBusy(true);
    try {
      const result = await uploadFile(createClient({ getCsrfToken: () => csrf }), uploadProject, file);
      push({kind:'note',text:'Upload operation: '+JSON.stringify(result.data)});
      window.dispatchEvent(new Event('asi:records-changed'));
    } catch (error) { push({kind:'err',text:(error as Error).message}); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="console-transcript flex-1 overflow-auto p-2 text-xs font-mono space-y-2">
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
      <div className="console-upload border-t p-2 flex gap-2 flex-wrap shrink-0">
        <label className="text-xs">File <input type="file" aria-label="Select file to upload" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <input aria-label="Upload project UUID" placeholder="Project UUID for upload" value={uploadProject} onChange={e=>setUploadProject(e.target.value)} className="border px-2 text-xs bg-transparent"/>
        <button onClick={()=>void uploadSelected()} disabled={!file || !csrf || busy} className="border px-2 text-xs">Upload selected file</button>
      </div>
      <div className="console-command border-t p-2 flex gap-2 shrink-0">
        <input
          aria-label="API command"
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
