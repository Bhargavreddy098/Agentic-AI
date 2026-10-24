"use client";
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowRight, Plus, Search, FolderKanban, MessageSquare, ChevronRight, ChevronDown, Settings2, PanelLeft, PanelRight, Files, ShieldCheck, X, Paperclip, RefreshCw, Activity, LockKeyhole, Layers3, FileBox } from 'lucide-react';
import { useSession } from '@/lib/session/SessionProvider';
import { createClient } from '@/lib/api/client';
import { recordRows, isUuid } from '@/lib/api/workbench';
import { beginOperation } from '@/lib/api/requirements';
import { findRoute } from '@/lib/api/manifest';
import { workspaceApi, messageBody, orderedMessages, saveFirstMessage, type WorkspaceRecord } from '@/lib/api/desktop-workspace';
import { ManagementContent, type ManagementPage } from '@/components/stages/management-content';
import { RunActivity } from '@/components/stages/run-activity';
import { StatusBar } from '@/components/shell/status-bar';
import './workbench.css';
import './desktop-workspace.css';
type Api = ReturnType<typeof workspaceApi>;
function useList(api: Api, path: string, params: Record<string, string>, enabled: boolean) {
    const identity = path + JSON.stringify(params);
    const [state, setState] = useState<{
        key: string;
        rows: WorkspaceRecord[];
        next?: string | null;
        error: string;
        loading: boolean;
        owner?: Api;
    }>({ key: '', rows: [], error: '', loading: false });
    const [revision, setRevision] = useState(0);
    const [page, setPage] = useState<{
        key: string;
        cursor?: string;
    }>({ key: identity });
    const cursor = page.key === identity ? page.cursor : undefined;
    useEffect(() => { if (!enabled)
        return; const abort = new AbortController(); let live = true; const timer = setTimeout(async () => { setState(s => ({ key: identity, rows: s.key === identity && s.owner === api ? s.rows : [], error: '', loading: true, owner: api })); try {
        const res = await api(path, { pathParams: JSON.parse(identity.slice(path.length)), query: { limit: '30', ...(cursor ? { cursor } : {}) }, signal: abort.signal });
        if (live)
            setState({ key: identity, rows: recordRows(res.data) ?? [], next: res.meta?.nextCursor, error: '', loading: false, owner: api });
    }
    catch (error) {
        if (live)
            setState({ key: identity, rows: [], error: (error as Error).message, loading: false, owner: api });
    } }, 0); return () => { live = false; clearTimeout(timer); abort.abort(); }; }, [api, path, identity, enabled, cursor, revision]);
    return { rows: enabled && state.key === identity && state.owner === api ? state.rows : [], next: enabled && state.key === identity && state.owner === api ? state.next : null, error: enabled && state.key === identity && state.owner === api ? state.error : '', loading: enabled && (state.key !== identity || state.owner !== api || state.loading), refresh: () => setRevision(v => v + 1), nextPage: () => setPage({ key: identity, cursor: state.next ?? undefined }), firstPage: () => setPage({ key: identity }) };
}
const settingsGroups: {
    label: string;
    items: [
        ManagementPage,
        string
    ][];
}[] = [
    { label: 'Workspace', items: [['projects', 'Project details'], ['grants', 'Project permissions'], ['budgets', 'Spending limits'], ['approvals', 'Needs attention']] },
    { label: 'Preferences', items: [['settings', 'General'], ['policies', 'Safety & permissions'], ['usage', 'Usage']] },
    { label: 'Models & connections', items: [['providers', 'Providers'], ['models', 'Model catalog'], ['routing', 'Routing preview']] },
    { label: 'Advanced', items: [['health', 'Connection health'], ['storage', 'Database diagnostics'], ['session', 'Owner session'], ['workspaces', 'Workspaces'], ['capabilities', 'Capabilities'], ['operations', 'Operation lookup'], ['console', 'API console'], ['conversations', 'Conversation tools'], ['artifacts', 'Artifact tools'], ['uploads', 'Upload tools']] },
];
function ConversationTree({ api, projectId, active, onSelect, query, connected }: {
    api: Api;
    projectId: string;
    active: string;
    onSelect: (row: WorkspaceRecord) => void;
    query: string;
    connected: boolean;
}) {
    const list = useList(api, '/projects/:projectId/conversations', { projectId }, connected);
    return <div className="desktop-conversation-list">{list.error && <p role="alert">{list.error}</p>}{list.loading && <p role="status">Loading conversations…</p>}{list.rows.filter(r => String(r.title ?? 'Untitled conversation').toLowerCase().includes(query.toLowerCase())).map(row => <button key={String(row.id)} aria-current={active === row.id ? 'page' : undefined} onClick={() => onSelect(row)}><MessageSquare size={14}/><span>{String(row.title ?? 'Untitled conversation')}</span></button>)}{!list.loading && !list.rows.length && !list.error && <p>No conversations yet</p>}{list.next && <button onClick={list.nextPage}>More conversations</button>}</div>;
}
function Conversation({ api, projectId, conversation, connected, onCreated, onTools, onFiles, drafts }: {
    api: Api;
    projectId: string;
    conversation: WorkspaceRecord | null;
    connected: boolean;
    onCreated: (row: WorkspaceRecord) => void;
    onTools: (page: ManagementPage) => void;
    onFiles: () => void;
    drafts: React.RefObject<Map<string, {
        text: string;
        title: string;
        attachments: string;
    }>>;
}) {
    const id = String(conversation?.id ?? '');
    const messages = useList(api, '/conversations/:conversationId/messages', { conversationId: id }, connected && !!id);
    const draftKey = projectId + ':' + id;
    const [draft, setDraft] = useState(() => drafts.current.get(draftKey)?.text ?? '');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [review, setReview] = useState(false);
    const [attachments, setAttachments] = useState(() => drafts.current.get(draftKey)?.attachments ?? '');
    useEffect(() => { drafts.current.set(draftKey, { text: draft, title: '', attachments }); }, [drafts, draftKey, draft, attachments]);
    const pending = useRef<{
        identity: string;
        operation: ReturnType<typeof beginOperation>;
    } | null>(null);
    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setError('');
        if (!connected) { setError('Start npm run gateway from the repository to connect this workspace. Your draft is not saved yet.'); return; }
        try {
            const body = messageBody(draft, attachments.split(',').map(s => s.trim()).filter(Boolean));
            if (!review) {
                setReview(true);
                return;
            }
            setBusy(true);
            const path = id ? '/conversations/:conversationId/messages' : '/projects/:projectId/conversations';
            const identity = path + projectId + id + JSON.stringify(body);
            if (pending.current?.identity !== identity)
                pending.current = { identity, operation: beginOperation(findRoute('POST', path)!) };
            const res = id ? await api(path, {pathParams:{conversationId:id},body,operation:pending.current.operation}, 'POST') : {data:await saveFirstMessage(api,projectId,draft,body.attachmentIds??[],pending.current.operation.idempotencyKey!)};
            pending.current = null;
            drafts.current.delete(draftKey);
            setReview(false);
            if (id) {
                setDraft('');
                setAttachments('');
                messages.firstPage();
                messages.refresh();
            }
            else {
                drafts.current.delete(draftKey);
                onCreated(res.data as WorkspaceRecord);
            }
        }
        catch (err) {
            setError((err as Error).message);
        }
        finally {
            setBusy(false);
        }
    }
    const rows = orderedMessages(messages.rows);
    return <div className="desktop-conversation"><div className="desktop-transcript" aria-live="polite">
 {!id ? <div className="desktop-welcome"><span className="desktop-wordmark">asi</span><h1>A place for your next idea.</h1><p>Start with a project. Keep the conversation, files, and decisions together.</p><div className="desktop-start-actions"><button onClick={() => onTools('projects')}><FolderKanban size={17}/> {projectId ? 'Manage project' : 'Create or choose a project'}<ArrowRight size={15}/></button><button onClick={onFiles}><FileBox size={17}/> Explore project files<ArrowRight size={15}/></button></div></div> : <><div className="desktop-thread-heading"><h1>{String(conversation?.title ?? 'Untitled conversation')}</h1><p>Project conversation</p><button onClick={messages.refresh} disabled={messages.loading}><RefreshCw size={14}/> Refresh messages</button></div>{messages.next && <button className="desktop-load" onClick={messages.nextPage}>Load next message page</button>}<button className="desktop-load" onClick={messages.firstPage}>First message page</button>{messages.loading && <p role="status">Loading messages…</p>}{messages.error && <p className="work-error" role="alert">{messages.error}</p>}{!messages.loading && !rows.length && !messages.error && <p className="desktop-no-messages">No messages yet. Start the conversation below.</p>}{rows.map(row => <article className={`desktop-message ${row.role === 'user' ? 'from-owner' : ''}`} key={String(row.id)}><div><strong>{row.role === 'user' ? 'You' : String(row.role ?? 'Message')}</strong><span>{row.createdAt ? new Date(String(row.createdAt)).toLocaleString() : ''}</span></div><p>{String(row.text ?? 'Content unavailable')}</p>{Array.isArray(row.attachmentIds) && row.attachmentIds.length > 0 && <button onClick={onFiles}><Paperclip size={13}/> {row.attachmentIds.length} attachment reference(s)</button>}</article>)}</>}
 </div><div className="desktop-composer-area"><form onSubmit={submit} className="desktop-composer"><label className="sr-only" htmlFor="desktop-message">Message</label><textarea id="desktop-message" placeholder="What would you like to work on?" value={draft} onChange={e=>{setDraft(e.target.value);setReview(false);}} maxLength={32000} disabled={busy} rows={3}/><div className="desktop-composer-controls"><button type="button" onClick={onFiles}><Paperclip size={17}/> Files</button>{id&&<details><summary>Attach existing files</summary><AttachmentPicker api={api} projectId={projectId} value={attachments} disabled={busy} onChange={value=>{setAttachments(value);setReview(false);}}/></details>}<span>{connected?'Gateway connected':'Gateway offline'}</span><button className="desktop-send" aria-label="Review message" disabled={busy||!draft.trim()}><ArrowUp size={18}/></button></div>{review&&<div className="desktop-send-review"><strong>Save this message?</strong><p>{draft}</p><small>{!projectId?'Creates a Personal project and conversation, then saves your first message.':!id?'Creates a conversation and saves your first message.':'Saves this message to your conversation.'} AI execution is not started.</small><div><button type="submit" className="work-primary" disabled={busy}>{busy?'Saving…':'Confirm and save'}</button><button type="button" disabled={busy} onClick={()=>setReview(false)}>Keep editing</button></div></div>}</form>{error&&<p className="work-error" role="alert">{error}</p>}<p className="desktop-composer-note">{connected?'Messages stay in this project. AI replies are not enabled in Stages 01–07.':<>Open your workspace with <code>npm run gateway</code>. No challenge or nonce to paste.</>}</p></div></div>;

}
function AttachmentPicker({ api, projectId, value, disabled, onChange }: {
    api: Api;
    projectId: string;
    value: string;
    disabled: boolean;
    onChange: (value: string) => void;
}) {
    const files = useList(api, '/projects/:projectId/artifacts', { projectId }, true);
    const selected = value.split(',').filter(Boolean);
    return <div className="desktop-attachment-picker"><p>Select up to 10 available files from this project.</p>{files.loading && <p role="status">Loading files…</p>}{files.error && <p role="alert">{files.error}</p>}{!files.loading && !files.rows.length && !files.error && <p>No files on this page. Upload through Files first; quarantined uploads cannot be attached.</p>}{files.rows.map(row => <label key={String(row.id)}><input type="checkbox" checked={selected.includes(String(row.id))} disabled={disabled || row.status !== 'available' || (!selected.includes(String(row.id)) && selected.length >= 10)} onChange={e => onChange((e.target.checked ? [...selected, String(row.id)] : selected.filter(id => id !== row.id)).join(','))}/><span>{String(row.mediaType ?? 'File')} · {String(row.bytes ?? '—')} bytes<small>{String(row.id)} · {String(row.status)}</small></span></label>)}{files.next && <button type="button" onClick={files.nextPage}>More files</button>}</div>;
}
export default function StudioWorkspace() {
    const session = useSession();
    const connected = session.status === 'connected';
    const client = useMemo(() => createClient({ getCsrfToken: () => session.session?.csrfToken ?? null, onUnauthorized: session.handleUnauthorized }), [session.session?.csrfToken, session.handleUnauthorized]);
    const api = useMemo(() => workspaceApi(client), [client]);
    const projects = useList(api, '/projects', {}, connected);
    const [projectId, setProjectId] = useState('');
    const [conversation, setConversation] = useState<WorkspaceRecord | null>(null);
    const [query, setQuery] = useState('');
    const [treeVersion, setTreeVersion] = useState(0);
    const [sidebar, setSidebar] = useState(false);
    const [pane, setPane] = useState<ManagementPage | 'activity' | null>(null);
    const [settings, setSettings] = useState<ManagementPage>('settings');
    const [searching, setSearching] = useState(false);
    const drafts = useRef(new Map<string, {
        text: string;
        title: string;
        attachments: string;
    }>());
    const activeProject = useRef('');
    const dialog = useRef<HTMLDialogElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const project = projects.rows.find(row => row.id === projectId);
    function selectProject(id: string) { const url = new URL(location.href); if (id)
        url.searchParams.set('projectId', id);
    else
        url.searchParams.delete('projectId'); history.replaceState(null, '', url); activeProject.current = id; setProjectId(id); setConversation(null); setSidebar(false); setPane(null); }
    function openSettings(page: ManagementPage = 'settings') { setSettings(page); dialog.current?.showModal(); setSidebar(false); }
    useEffect(() => { const read = () => { const selected = new URLSearchParams(location.search).get('projectId'); if (selected && isUuid(selected)) {
        activeProject.current = selected;
        setProjectId(selected);
    } const hash = location.hash.slice(1) as ManagementPage; if (settingsGroups.some(g => g.items.some(([id]) => id === hash))) {
        setSettings(hash);
        dialog.current?.showModal();
    } }; const timer = setTimeout(read, 0); window.addEventListener('hashchange', read); return () => { clearTimeout(timer); window.removeEventListener('hashchange', read); }; }, []);
    useEffect(() => { if (!connected) {
        const timer = setTimeout(() => { setConversation(null); setPane(null); setProjectId(''); drafts.current.clear(); }, 0);
        return () => clearTimeout(timer);
    } }, [connected]);
    function closeSettings() { dialog.current?.close(); if (location.hash)
        history.replaceState(null, '', location.pathname + location.search); projects.refresh(); setTreeVersion(v => v + 1); }
    return <div className="asi-workbench desktop-shell">{sidebar && <button className="desktop-nav-backdrop" aria-label="Close sidebar" onClick={() => setSidebar(false)}/>}
 <aside className={`desktop-sidebar ${sidebar ? 'open' : ''}`} aria-label="Project navigation"><div className="desktop-brand"><Link href="/studio" aria-label="ASI workspace">asi</Link><button aria-label="Close sidebar" onClick={() => setSidebar(false)}><X size={17}/></button></div><div className="desktop-workspace-label"><Layers3 size={16}/><span>Local workspace</span><LockKeyhole size={12}/></div>
 <button className="desktop-new" onClick={() => { setConversation(null); setSidebar(false); }}><Plus size={17}/> New conversation</button><button className="desktop-nav-action" onClick={() => { setSearching(v => !v); setTimeout(() => searchRef.current?.focus(), 0); }}><Search size={17}/> Search loaded history</button>{searching && <input ref={searchRef} className="desktop-search" aria-label="Search projects and conversations" placeholder="Project or conversation name" value={query} onChange={e => setQuery(e.target.value)}/>}
 <button className="desktop-nav-action" onClick={() => { setPane('approvals'); setSidebar(false); }}><ShieldCheck size={17}/> Needs attention</button>
 <div className="desktop-project-heading"><h2>Projects</h2><div><button aria-label="Refresh projects" onClick={projects.refresh} disabled={!connected}><RefreshCw size={13}/></button><button aria-label="Create project" onClick={() => openSettings('projects')}><Plus size={15}/></button></div></div>
 <nav className="desktop-project-tree" aria-label="Projects">{!connected ? <div className="desktop-sidebar-empty">Start the local gateway to load your projects.<code className="desktop-gateway-command">npm run gateway</code></div> : <>{projects.loading && <p role="status">Loading projects…</p>}{projects.error && <p className="work-error" role="alert">{projects.error}</p>}{projects.rows.map(row => { const selected = row.id === projectId; const matches = String(row.name ?? '').toLowerCase().includes(query.toLowerCase()); if (!matches && !selected)
        return null; return <div key={String(row.id)}><button className="desktop-project-row" aria-expanded={selected} onClick={() => selectProject(String(row.id))}>{selected ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<FolderKanban size={16}/><span>{String(row.name ?? 'Untitled project')}</span></button>{selected && <ConversationTree key={projectId + treeVersion} api={api} projectId={projectId} active={String(conversation?.id ?? '')} onSelect={row => { setConversation(row); setSidebar(false); }} query={query} connected={connected}/>}</div>; })}{!projects.loading && !projects.rows.length && !projects.error && <p>No projects yet. Create one to get started.</p>}{projects.next && <button onClick={projects.nextPage}>More projects</button>}</>}</nav>
 <div className="desktop-sidebar-bottom"><button className="desktop-nav-action" onClick={() => openSettings()}><Settings2 size={17}/> Settings</button><button className="desktop-nav-action" onClick={() => openSettings('health')}><span className={`owner-dot ${connected ? 'connected' : ''}`}/><span>{connected ? 'Gateway connected' : session.status === 'unknown' ? 'Checking gateway…' : 'Gateway offline'}</span></button></div></aside>
 <main className="desktop-main"><header className="desktop-header"><div><button aria-label="Toggle sidebar" onClick={() => setSidebar(v => !v)}><PanelLeft size={18}/></button><span>{String(project?.name ?? 'Workspace')}</span><ChevronRight size={13}/><strong>{String(conversation?.title ?? 'New conversation')}</strong></div><div><button aria-label="Open project settings" onClick={() => openSettings('projects')}><Settings2 size={17}/></button><button aria-label="Open files" aria-pressed={pane === 'artifacts'} onClick={() => setPane(p => p === 'artifacts' ? null : 'artifacts')}><Files size={17}/></button><button aria-label="Open activity" aria-pressed={pane === 'activity'} onClick={() => setPane(p => p === 'activity' ? null : 'activity')}><Activity size={17}/></button><button aria-label="Toggle context pane" onClick={() => setPane(p => p ? null : 'artifacts')}><PanelRight size={18}/></button></div></header>
 <div className="desktop-body"><Conversation key={projectId + String(conversation?.id ?? '') + session.status} api={api} drafts={drafts} projectId={projectId} conversation={conversation} connected={connected} onCreated={row => { if (activeProject.current && row.projectId !== activeProject.current) return; if(!activeProject.current){activeProject.current=String(row.projectId);setProjectId(String(row.projectId));projects.refresh();const url=new URL(location.href);url.searchParams.set('projectId',String(row.projectId));history.replaceState(null,'',url);} setConversation(row); setTreeVersion(v => v + 1); }} onTools={openSettings} onFiles={() => setPane('artifacts')}/>
 {pane && <aside className="desktop-context" aria-label="Working context"><header><h2>{pane === 'activity' ? 'Activity' : pane === 'approvals' ? 'Needs attention' : pane === 'artifacts' ? 'Files & outputs' : 'Project tools'}</h2><button aria-label="Close context pane" onClick={() => setPane(null)}><X size={17}/></button></header>{pane === 'activity' ? <RunActivity key={projectId + session.status} projectId={projectId}/> : <><div className="desktop-context-tabs"><button onClick={() => setPane('artifacts')}>Files</button><button onClick={() => setPane('uploads')}>Upload</button><button onClick={() => setPane('approvals')}>Decisions</button></div><ManagementContent key={pane + projectId + session.status} active={pane} projectId={projectId} onProjectChange={selectProject}/></>}</aside>}</div><StatusBar /></main>
 <dialog ref={dialog} className="desktop-settings asi-workbench" aria-label="Workspace settings" onCancel={event => { event.preventDefault(); closeSettings(); }}><header><div><Settings2 size={18}/><h2>Workspace settings</h2></div><button aria-label="Close settings" onClick={closeSettings}><X size={19}/></button></header><div className="desktop-settings-body"><nav aria-label="Settings sections">{settingsGroups.map(group => <section key={group.label}><h3>{group.label}</h3>{group.items.map(([id, name]) => <button key={id} aria-current={settings === id ? 'page' : undefined} onClick={() => setSettings(id)}>{name}</button>)}</section>)}</nav><div className="desktop-settings-content"><ManagementContent key={settings + projectId + session.status} active={settings} projectId={projectId} onProjectChange={selectProject}/></div></div></dialog>
 </div>;
}
