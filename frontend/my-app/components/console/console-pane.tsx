"use client";

import { useRef, useState } from 'react';
import { parseCommand, pathParamsFor } from './parse';
import { createClient } from '@/lib/api/client';
import { beginOperation } from '@/lib/api/requirements';
import { useSession } from '@/lib/session/SessionProvider';

type Entry = { kind: 'input' | 'ok' | 'err' | 'note'; text: string; status?: number; ms?: number };

function flagsToBody(route: { path: string; method: string }, positional: string[], flags: Record<string, string>) {
  const id = positional[0];
  if (route.path === '/projects' && route.method === 'POST') {
    return { name: positional[0], kind: flags.kind ?? 'greenfield' };
  }
  if (route.path === '/projects/:projectId' && route.method === 'PATCH') {
    const body: any = {};
    if (flags.name) body.name = flags.name;
    if (flags.description) body.description = flags.description;
    return body;
  }
  if (route.path.endsWith('/archive')) return { reason: flags.reason ?? '' };
  if (route.path.endsWith('/snapshots')) return { includeUncommitted: flags['include-uncommitted'] === 'true' };
  if (route.path.endsWith('/conversations') && route.method === 'POST') return flags.title ? { title: flags.title } : {};
  if (route.path.endsWith('/messages') && route.method === 'POST') return { text: flags.text ?? '' };
  if (route.path.endsWith('/decisions')) return { decision: flags.decision, nonce: flags.nonce, digest: flags.digest, reason: flags.reason };
  if (route.path.endsWith('/revoke')) return { reason: flags.reason ?? '' };
  if (route.path === '/providers' && route.method === 'POST') return { kind: flags.kind, displayName: positional[0], endpointPolicy: flags['endpoint-policy'], privacyPolicy: flags['privacy-policy'] };
  if (route.path === '/providers/:providerId' && route.method === 'PATCH') {
    const body: any = {};
    if (flags['display-name']) body.displayName = flags['display-name'];
    if (flags.enabled) body.enabled = flags.enabled === 'true';
    return body;
  }
  if (route.path.endsWith('/discovery')) return { probe: flags.probe === 'true' };
  if (route.path === '/routing/preview') return {
    taskType: flags['task-type'], capabilities: flags.capabilities ? flags.capabilities.split(',') : [],
    estimatedInputTokens: Number(flags['input-tokens'] ?? 0), maxOutputTokens: Number(flags['max-output-tokens'] ?? 0),
    classification: flags.classification, budgetCeilingMicroUsd: flags['budget-ceiling'] ? Number(flags['budget-ceiling']) : undefined
  };
  if (route.path.endsWith('/grants') && route.method === 'POST') return { capability: flags.capability, resourceScope: flags['resource-scope'], expiresAt: flags['expires-at'] };
  if (route.path === '/session/bootstrap') return { challenge: flags.challenge, clientNonce: flags.nonce };
  if (route.path === '/artifacts/:artifactId/export') return { destinationRef: flags['destination-ref'] };
  if (route.path === '/projects/:projectId/uploads') return { filename: flags.filename, mediaType: flags['media-type'], bytes: flags.bytes, digest: flags.digest };
  if (route.path === '/uploads/:uploadId/content') return { bytes: flags.bytes, digest: flags.digest };
  if (route.path === '/uploads/:uploadId/complete') return { digest: flags.digest };
  if (route.path === '/policies/revisions') return { baseRevisionId: flags['base-revision-id'], rules: flags.rules ? JSON.parse(flags.rules) : {}, reason: flags.reason };
  if (route.path.endsWith('/activate')) return { digest: flags.digest };
  if (route.path.endsWith('/approval-requests')) return { digest: flags.digest };
  if (route.path.endsWith('/budgets') && route.method === 'POST') return { scopeKind: flags['scope-kind'], runId: flags['run-id'], limitMicroUsd: Number(flags['limit-micro-usd'] ?? 0), reason: flags.reason };
  if (route.path === '/budgets/:budgetId' && route.method === 'PATCH') return { limitMicroUsd: Number(flags['limit-micro-usd'] ?? 0), reason: flags.reason };
  return undefined;
}

function flagsToQuery(flags: Record<string, string>) {
  const skip = new Set(['if-match', 'kind', 'name', 'description', 'title', 'text', 'reason', 'decision', 'nonce', 'digest', 'display-name', 'enabled', 'endpoint-policy', 'privacy-policy', 'include-uncommitted', 'probe', 'task-type', 'capabilities', 'input-tokens', 'max-output-tokens', 'classification', 'budget-ceiling', 'capability', 'resource-scope', 'expires-at', 'retention', 'default-autonomy', 'limits', 'privacy']);
  const out: Record<string, string> = {};
  const camel: Record<string, string> = { 'project-id': 'projectId', 'run-id': 'runId', 'provider-id': 'providerId', 'budget-ceiling-micro-usd': 'budgetCeilingMicroUsd' };
  for (const [k, v] of Object.entries(flags)) {
    if (skip.has(k) || !v) continue;
    out[camel[k] ?? k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function ConsolePane() {
  const [entries, setEntries] = useState<Entry[]>([{ kind: 'note', text: 'Type help or a command. Tab-complete is not yet wired.' }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const session = useSession() as any;
  const csrf = session?.session?.csrfToken ?? null;

  async function run() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setEntries(e => [...e, { kind: 'input', text }]);

    if (text === 'help') {
      setEntries(e => [...e, { kind: 'note', text: 'Commands: create project, patch project, list projects, send message, decide approval, preview routing…' }]);
      return;
    }

    const parsed = parseCommand(text);
    if (!parsed.ok) {
      setEntries(e => [...e, { kind: 'err', text: parsed.error }]);
      return;
    }

    const client = createClient({ getCsrfToken: () => csrf, onUnauthorized: () => session?.handleUnauthorized?.() });
    const op = beginOperation(parsed.route);
    const pathParams = pathParamsFor(parsed.route, parsed.positional);
    const body = flagsToBody(parsed.route, parsed.positional, parsed.flags);
    const query = flagsToQuery(parsed.flags);
    const ifMatch = parsed.flags['if-match'];

    setBusy(true);
    const t0 = performance.now();
    const res: any = await client.request(parsed.route, { pathParams, body, query, ifMatch, operation: op });
    const ms = Math.round(performance.now() - t0);
    setBusy(false);

    if (res.ok) {
      setEntries(e => [...e, { kind: 'ok', status: res.status, ms, text: `${parsed.route.method} ${parsed.route.canonicalRoute} → ${res.status}` }]);
    } else {
      setEntries(e => [...e, { kind: 'err', status: res.problem.status, ms, text: `${res.problem.code} · ${res.problem.title}${res.problem.detail ? ` — ${res.problem.detail}` : ''}` }]);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-2 text-xs font-mono space-y-1">
        {entries.map((en, i) => (
          <div key={i} className={en.kind === 'input' ? 'text-foreground' : en.kind === 'err' ? 'text-red-500' : en.kind === 'ok' ? 'text-muted-foreground' : 'opacity-60'}>
            {en.kind === 'input' ? `> ${en.text}` : `${en.status ? `[${en.status}] ` : ''}${en.text}${en.ms !== undefined ? `  ${en.ms}ms` : ''}`}
          </div>
        ))}
      </div>
      <div className="border-t p-2 flex gap-2">
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
