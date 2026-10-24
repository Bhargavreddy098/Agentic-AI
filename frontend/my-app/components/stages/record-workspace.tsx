"use client";

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, FileUp, RefreshCw, ChevronLeft, ChevronRight, ShieldCheck, Fingerprint, Plus, PencilLine, Search, Archive, Camera, Download, ListFilter, CheckCheck, Ban, Send, Play, Route } from 'lucide-react';
import { useSession } from '@/lib/session/SessionProvider';
import { createClient, type RequestOptions } from '@/lib/api/client';
import { findRoute } from '@/lib/api/manifest';
import { actionsFor, identifiers, prepareAction, recordRows, recordTitle, safeDisplay, scopedParams } from '@/lib/api/workbench';
import type { CommandSpec } from '@/components/console/grammar';
import { uploadFile } from '@/lib/api/upload';

type Outcome = { data: unknown; status: number; version?: string; requestId?: string; nextCursor?: string | null };
const label = (name: string) => name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ').replace(/\bif match\b/, 'Version (If-Match)').replace(/^./, c => c.toUpperCase());
const actionLabel = (name: string) => label(name).replace(/^Patch /, 'Edit ').replace(/^Get /, 'View ').replace(/^List /, 'Browse ');
const jsonFields = new Set(['rules', 'privacy', 'privacy-policy', 'endpoint-policy', 'resource-scope', 'retention', 'limits']);
function actionPresentation(command: CommandSpec) {
  const verb = command.name.split(' ')[0];
  const presentations: Record<string, { icon: typeof Plus; description: string }> = {
    create: { icon: Plus, description: 'Set up a new record' }, list: { icon: ListFilter, description: 'Browse and filter records' },
    get: { icon: Search, description: 'Inspect details and current values' }, update: { icon: PencilLine, description: 'Review and save your changes' },
    archive: { icon: Archive, description: 'Retire a project from active work' }, snapshot: { icon: Camera, description: 'Capture a repository revision' },
    export: { icon: Download, description: 'Export to a native destination' }, download: { icon: Download, description: 'Save artifact content' },
    revoke: { icon: Ban, description: 'Review and remove authorization' }, activate: { icon: Play, description: 'Review and activate this revision' },
    send: { icon: Send, description: 'Add a message to a conversation' }, decide: { icon: CheckCheck, description: 'Review the exact approval request' },
    preview: { icon: Route, description: 'Inspect eligible model routing' },
  };
  return presentations[verb] ?? { icon: command.routeKey.startsWith('GET') ? Search : PencilLine, description: command.routeKey.startsWith('GET') ? 'Read the current backend record' : 'Configure and review this action' };
}

function SessionEmpty({ surface }: { surface: string }) {
  return <div className="work-session-empty"><Fingerprint size={36} strokeWidth={1.3} aria-hidden="true" /><h3>Your {surface}, in one place</h3><p>Connect your local owner session to view and manage this workspace.</p><Link href="/connect" className="work-secondary">Connect owner <ArrowRight size={14} /></Link><small><ShieldCheck size={13} /> Private to your local workspace</small></div>;
}
const help: Record<string, string> = {
  'if-match': 'Read the current record first. Use its exact version; a conflict requires reloading.',
  'workspace-root-ref': 'Use a root registered by the trusted native owner command. A host path is not accepted.',
  'repository-connection-id': 'Optional registered repository connection UUID.',
  'destination-ref': 'Register a new output destination with npm run artifact:authorize-export. Enter its opaque UUID, never a host path.',
  'secret-reference-id': 'Reference an existing trusted secret. Do not enter a raw API key.',
  'attachment-ids': 'Optional comma-separated artifact UUIDs belonging to this conversation’s project.',
  'limit-micro-usd': 'Exact decimal string in micro-USD. 1000000 equals 1 USD.',
  'budget-ceiling': 'Exact decimal string in micro-USD.',
  'digest': 'Use the exact digest returned by the record you reviewed.',
  'nonce': 'Use the current approval nonce. It is bound to the exact approval and digest.',
  'expires-at': 'ISO 8601 timestamp including time zone, for example 2026-12-01T12:00:00Z.',
  'base-revision-id': 'UUID of the policy revision you are changing.',
  'contract-revision-id': 'Optional existing immutable contract revision UUID. Contract generation is a later stage.',
  'probe': 'Keep false. Paid discovery probes are unavailable in the current HTTP contract.',
  'privacy': 'Complete object: denyEgress (boolean), allowedEgressHosts (string array). Must match active policy.',
  'limits': 'Complete object: requireReservation (boolean), maxSingleActionMicroUsd (integer). Must match active policy.',
  'retention': 'Complete object: diagnosticLogDays, sseEventDays, temporaryUploadHours, failedWorkspaceDays. Values are integers.',
  'rules': 'Complete PolicyRules JSON. Read the active policy first and edit a copy of its rules.',
  'resource-scope': 'Strict ResourceScope JSON for the capability being granted.',
  'endpoint-policy': 'Strict endpoint policy JSON. Hosts must already be operator-allowlisted.',
  'privacy-policy': 'Strict provider privacy policy JSON; use the fields in the approved provider contract.',
};

function Choices({ name, command, value, change }: { name: string; command: CommandSpec; value: string; change: (v: string) => void }) {
  const options: Record<string, string[]> = {
    'kind': command.name === 'create project' ? ['greenfield', 'existing'] : ['openai', 'openai_compatible'],
    'enabled': ['true', 'false'], 'include-uncommitted': ['false', 'true'],
    'decision': ['approve', 'reject'], 'scope-kind': ['project'],
    'classification': ['public', 'internal'],
    'default-autonomy': ['plan_only', 'ask_before_every_change', 'autonomous_coding', 'full_autonomous_build'],
    'probe': ['false'],
  };
  if (options[name]) return <select value={value} onChange={e => change(e.target.value)}><option value="">Choose {label(name).toLowerCase()}</option>{options[name].map(v => <option key={v}>{v}</option>)}</select>;
  if (jsonFields.has(name) || name === 'text' || name === 'description' || name === 'reason') return <textarea rows={jsonFields.has(name) ? 5 : 3} value={value} onChange={e => change(e.target.value)} spellCheck={false} maxLength={name === 'text' ? 32000 : undefined} />;
  return <input type={name === 'secret-reference-id' || name === 'nonce' ? 'password' : 'text'} value={value} onChange={e => change(e.target.value)} autoComplete="off" spellCheck={false} />;
}

export function DataResult({ result, onRecord }: { result: Outcome; onRecord?: (row: Record<string, unknown>) => void }) {
  const rows = recordRows(result.data);
  return <div className="records-result">
    <div className="result-meta" role="status"><span>HTTP {result.status}</span>{result.version && <span>Version {result.version}</span>}{result.requestId && <span>Request {result.requestId}</span>}</div>
    {result.status === 202 && <p className="work-notice">Accepted for processing. Read its operation ID in Operations to inspect the recorded outcome. This is not a completion confirmation.</p>}
    {rows ? rows.length ? <div className="work-records">{rows.map((row, i) => <button key={String(row.id ?? i)} onClick={() => onRecord?.(row)} disabled={!onRecord}>
      <span><strong>{recordTitle(row)}</strong><small>{String(row.id ?? row.state ?? row.status ?? '')}</small></span><span>{String(row.state ?? row.status ?? '')}</span>{onRecord && <ArrowRight size={15} />}
    </button>)}</div> : <div className="work-empty">No records yet. Create a record using the actions below, or change your filters.</div> : result.data === null || result.data === undefined ? <p className="work-empty">Request completed without a response body.</p> : <pre className="work-json">{JSON.stringify(safeDisplay(result.data), null, 2)}</pre>}
    {rows && rows.length > 0 && <details><summary>View response data</summary><pre className="work-json">{JSON.stringify(safeDisplay(result.data), null, 2)}</pre></details>}
  </div>;
}

export function ProjectSelector({ projectId, onChange }: { projectId: string; onChange: (id: string) => void }) {
  const session = useSession();
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const csrf = session.session?.csrfToken ?? null;
  const handleUnauthorized = session.handleUnauthorized;
  const load = useCallback(async (next?: string, signal?: AbortSignal) => {
    setBusy(true); setError('');
    const result = await createClient({ onUnauthorized: handleUnauthorized }).request(findRoute('GET', '/projects')!, { query: { limit: '50', ...(next ? { cursor: next } : {}) }, signal });
    if (signal?.aborted) return;
    if (result.ok) { setProjects(p => next ? [...p, ...(recordRows(result.data) ?? [])] : recordRows(result.data) ?? []); setCursor(result.meta?.nextCursor ?? null); }
    else setError(`${result.problem.code}: ${result.problem.title}`);
    setBusy(false);
  }, [handleUnauthorized]);
  useEffect(() => {
    if (!csrf) return;
    const controller = new AbortController();
    const timer = setTimeout(() => { void load(undefined, controller.signal); }, 0);
    const refresh = () => { void load(undefined, controller.signal); };
    window.addEventListener('asi:records-changed', refresh);
    return () => { clearTimeout(timer); controller.abort(); window.removeEventListener('asi:records-changed', refresh); };
  }, [csrf, load]);
  return <div className="work-project"><label>Project<select aria-label="Selected project" value={projectId} onChange={e => onChange(e.target.value)} disabled={!csrf || busy}><option value="">Choose a project</option>{projects.map(p => <option key={String(p.id)} value={String(p.id)}>{String(p.name ?? p.id)}</option>)}</select></label><button className="work-icon" aria-label="Refresh projects" disabled={!csrf || busy} onClick={() => void load()}><RefreshCw size={15} /></button>{cursor && <button disabled={busy} onClick={() => void load(cursor)}>More projects</button>}{error && <p role="alert">{error}</p>}</div>;
}

function ActionForm({ command, projectId, selected, onDone }: { command: CommandSpec; projectId: string; selected: Record<string, unknown> | null; onDone: () => void }) {
  const session = useSession();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const ids = identifiers(command.routeKey);
    return { ...Object.fromEntries(ids.filter(id => id !== 'projectId').map(id => [id, String(selected?.id ?? '')])), projectId, 'if-match': String(selected?.version ?? '') };
  });
  const [prepared, setPrepared] = useState<ReturnType<typeof prepareAction> | null>(null);
  const [result, setResult] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const route = findRoute(...command.routeKey.split(' ') as [string, string])!;
  const mutation = route.method !== 'GET';
  const client = () => createClient({ getCsrfToken: () => session.session?.csrfToken ?? null, onUnauthorized: session.handleUnauthorized });
  async function execute(packet: ReturnType<typeof prepareAction>) {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await client().request(packet.route, packet.options);
      if (!res.ok) { setError(`${res.problem.code}: ${res.problem.title}${res.problem.detail ? ' — ' + res.problem.detail : ''}${[409, 412].includes(res.problem.status) ? ' Reload the record and re-apply your change.' : ''}${res.problem.code === 'NETWORK_ERROR' ? ' Outcome may be unknown; read the record before submitting another write.' : ''}${res.problem.requestId ? ' · Request ' + res.problem.requestId : ''}`); return; }
      if (packet.route.responseEnvelope === 'bytes') {
        const url = URL.createObjectURL(new Blob([res.data as ArrayBuffer], { type: 'application/octet-stream' }));
        const a = document.createElement('a'); a.href = url; a.download = `${packet.options.pathParams?.artifactId ?? 'artifact'}.bin`; a.click(); URL.revokeObjectURL(url);
        setResult({ status: res.status, data: { downloadedBytes: (res.data as ArrayBuffer).byteLength } });
      } else setResult({ status: res.status, data: res.data, version: res.meta?.version, requestId: res.meta?.requestId, nextCursor: res.meta?.nextCursor });
      if (mutation) { window.dispatchEvent(new Event('asi:records-changed')); onDone(); }
    } catch (err) { setError((err as Error).message); }
    finally { setPrepared(null); setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setResult(null);
    try {
      let bytes: Uint8Array | undefined;
      if (route.method === 'PUT') {
        if (!file || file.size > 16777216) throw new Error('Choose a real file of at most 16 MiB.');
        bytes = new Uint8Array(await file.arrayBuffer());
      }
      const packet = prepareAction(command, { ...values, projectId: values.projectId || projectId }, session.session?.csrfToken ?? null, bytes);
      if (mutation) setPrepared(packet); else await execute(packet);
    } catch (err) { setError((err as Error).message); }
  }
  const fields = [...identifiers(route.path), ...(command.positional && !identifiers(route.path).length ? ['name'] : []), ...command.flags];
  return <section className="work-action-panel">
    <h3>{actionLabel(command.name)}</h3>
    <details className="contract-details"><summary>Request contract</summary><p>{route.requestDto}</p><code>{route.method} {route.canonicalRoute}</code><p>{route.authProfile} · {route.csrfRequired ? 'CSRF protected' : 'Read access'}{route.idempotencyKeyRequired ? ' · Idempotent request' : ''}</p>{route.limitations.map(l => <p key={l}>{l}</p>)}</details>
    {!session.session && route.authProfile !== 'Public' ? <div className="work-empty">Connect your owner session to use this action. <Link href="/connect">Connect owner <ArrowRight size={14} /></Link></div> : <form onSubmit={submit}>
      <fieldset disabled={busy || !!prepared} className="work-fields">
        {fields.map(name => <label key={name}><span>{label(name)}</span>{name === 'projectId' ? <input value={projectId || values.projectId || ''} onChange={e => setValues(v => ({ ...v, projectId: e.target.value }))} readOnly={!!projectId} placeholder="Select a project above or enter its UUID" /> : <Choices name={name} command={command} value={values[name] ?? ''} change={value => setValues(v => ({ ...v, [name]: value }))} />}{help[name] && <small>{help[name]}</small>}</label>)}
        {route.method === 'PUT' && <label>File<input type="file" aria-label="Upload content file" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
        {!fields.length && <p className="work-hint">This action needs no additional fields.</p>}
        <button className="work-primary" type="submit">{busy ? 'Working…' : mutation ? 'Review change' : 'Load result'} <ArrowRight size={14} /></button>
      </fieldset>
    </form>}
    {prepared && <div className="work-review"><h4>Review {label(command.name).toLowerCase()}</h4><p>This sends a real change using your owner permissions. Confirm the target and values below.</p><pre className="work-json">{JSON.stringify(safeDisplay({ target: prepared.options.pathParams, body: prepared.options.body, version: prepared.options.ifMatch, ...(file ? { file: file.name, bytes: file.size } : {}) }), null, 2)}</pre><div className="work-button-row"><button className="work-primary" disabled={busy} onClick={() => void execute(prepared)}>{busy ? 'Submitting…' : 'Confirm and submit'}</button><button disabled={busy} onClick={() => setPrepared(null)}>Keep editing</button></div></div>}
    {error && <p className="work-error" role="alert">{error}</p>}
    {result && <DataResult result={result} />}
    {result?.nextCursor && <button onClick={() => { setValues(v => ({ ...v, cursor: result.nextCursor! })); setResult(null); }}>Use next page cursor</button>}
  </section>;
}

export function RecordWorkspace({ surface, projectId }: { surface: string; projectId: string }) {
  const session = useSession();
  const commands = actionsFor(surface);
  const defaultRead = commands.find(c => c.routeKey.startsWith('GET ') && !identifiers(c.routeKey).some(k => k !== 'projectId'));
  const [actionName, setActionName] = useState<string | null>(() => !defaultRead && commands.length === 1 ? commands[0].name : null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [history, setHistory] = useState<(string | undefined)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const csrf = session.session?.csrfToken ?? null;
  const scoped = !!defaultRead?.routeKey.includes(':projectId');
  const command = commands.find(c => c.name === actionName);
  const readKey = defaultRead?.routeKey;
  useEffect(() => {
    if (!csrf || !readKey || (scoped && !projectId)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      const [method, path] = readKey.split(' ');
      try {
        const route = findRoute(method, path)!;
        const pageable = actionsFor(surface).find(c => c.routeKey === readKey)?.flags.includes('cursor');
        const options: RequestOptions = { pathParams: scopedParams(path, projectId), signal: controller.signal, ...(pageable ? { query: { limit: '25', ...(cursor ? { cursor } : {}) } } : {}) };
        const result = await createClient({ onUnauthorized: session.handleUnauthorized }).request(route, options);
        if (controller.signal.aborted) return;
        if (result.ok) setOutcome({ data: result.data, status: result.status, version: result.meta?.version, requestId: result.meta?.requestId, nextCursor: result.meta?.nextCursor });
        else { setOutcome(null); setError(`${result.problem.code}: ${result.problem.title}`); }
      } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [csrf, readKey, scoped, projectId, cursor, refresh, surface, session.handleUnauthorized]);
  function selectRecord(row: Record<string, unknown>) {
    setSelected(row);
    const read = commands.find(c => c.name.startsWith('get ') && identifiers(c.routeKey).length > 0);
    setActionName(read?.name ?? commands.find(c => c.routeKey.startsWith('PATCH '))?.name ?? null);
  }
  return <>
    {defaultRead && <section className="work-data-panel"><div className="work-section-heading"><h2>{label(defaultRead.name.replace(/^list /, ''))}</h2><button className="work-secondary" disabled={!csrf || loading || (scoped && !projectId)} onClick={() => setRefresh(r => r + 1)}><RefreshCw size={14} /> Refresh</button></div>
      {!csrf ? <SessionEmpty surface={surface} /> : scoped && !projectId ? <p className="work-empty">Choose a project above to view its {surface}. No project request has been sent.</p> : loading ? <p role="status" className="work-empty">Loading {surface}…</p> : error ? <p className="work-error" role="alert">{error} <button onClick={() => setRefresh(r => r + 1)}>Retry</button></p> : outcome && <><DataResult result={outcome} onRecord={selectRecord} /><div className="work-pagination"><button disabled={!history.length} onClick={() => { const prev = [...history]; setCursor(prev.pop()); setHistory(prev); }}><ChevronLeft size={14} /> Previous</button><button disabled={!outcome.nextCursor} onClick={() => { setHistory(h => [...h, cursor]); setCursor(outcome.nextCursor ?? undefined); }}>Next <ChevronRight size={14} /></button></div></>}
    </section>}
    <section className="work-actions"><div className="work-actions-heading"><div><h2>Workspace actions</h2><p>Choose an action. Review every change before it takes effect.</p></div><ShieldCheck size={18} aria-hidden="true" /></div><div className="work-action-buttons">{commands.map(c => { const presentation = actionPresentation(c); const Icon = presentation.icon; return <button aria-pressed={actionName === c.name} key={c.name} onClick={() => { setActionName(c.name); if (!selected && outcome?.data && typeof outcome.data === 'object' && !recordRows(outcome.data)) setSelected(outcome.data as Record<string, unknown>); }}><Icon size={18} strokeWidth={1.7} /><span><strong>{actionLabel(c.name)}</strong><small>{presentation.description}</small></span><ArrowRight size={15} /></button>; })}</div></section>
    {selected && !command && <DataResult result={{ data: selected, status: outcome?.status ?? 200 }} />}
    {command && <ActionForm key={command.name + projectId + String(selected?.id ?? '') + String(selected?.version ?? '')} command={command} projectId={surface === 'projects' && selected?.id ? String(selected.id) : projectId} selected={selected} onDone={() => setRefresh(r => r + 1)} />}
    {surface === 'uploads' && <GuidedUpload projectId={projectId} />}
    {surface === 'artifacts' && <p className="work-hint">Only released artifacts can be exported. Native destination references are registered outside the browser. Unsupported kind and run filters are intentionally unavailable.</p>}
    {surface === 'approvals' && <p className="work-hint">Use existing immutable revision IDs. Plan and contract generation are not part of Stage 01–06.</p>}
  </>;
}

function GuidedUpload({ projectId }: { projectId: string }) {
  const session = useSession(); const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState<Outcome | null>(null);
  async function send() {
    if (!file) return; setBusy(true); setError(''); setResult(null);
    try { const res = await uploadFile(createClient({ getCsrfToken: () => session.session?.csrfToken ?? null, onUnauthorized: session.handleUnauthorized }), projectId, file); setResult({ data: res.data, status: res.status }); window.dispatchEvent(new Event('asi:records-changed')); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }
  return <section className="work-action-panel"><h2><FileUp size={18} /> Upload a file</h2><p>The file is hashed, staged, uploaded, and finalized against the selected project. Maximum 16 MiB.</p><label>Choose file<input type="file" disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label><button className="work-primary" disabled={!file || !projectId || !session.session || busy} onClick={() => void send()}>{busy ? 'Uploading…' : 'Upload selected file'}</button>{error && <p role="alert" className="work-error">{error}</p>}{result && <DataResult result={result} />}<p className="work-hint"><ShieldCheck size={14} /> Upload acceptance does not release an artifact from quarantine.</p></section>;
}

