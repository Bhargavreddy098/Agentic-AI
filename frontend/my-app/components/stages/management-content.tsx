"use client";
import { useState } from 'react';
import { SURFACES, type SurfaceId } from '@/lib/api/surfaces';
import { DESCRIPTIONS } from '@/lib/api/workbench';
import { HealthPanel } from '@/components/shell/health-panel';
import { ConsolePane } from '@/components/console/console-pane';
import { ProjectSelector, RecordWorkspace } from './record-workspace';
import { useSession } from '@/lib/session/SessionProvider';
export type ManagementPage = SurfaceId | 'storage' | 'console';
export function ManagementContent({ active, projectId, onProjectChange }: {
    active: ManagementPage;
    projectId: string;
    onProjectChange: (id: string) => void;
}) {
    const session = useSession();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const page = SURFACES.find(p => p.id === active) ?? { label: active === 'storage' ? 'Database diagnostics' : 'API console' };
    async function disconnect() { setBusy(true); setError(''); try {
        await session.revoke();
    }
    catch {
        setError('Session revocation could not be confirmed.');
    }
    finally {
        setBusy(false);
    } }
    return <div className="management-content"><h2>{page.label}</h2><p className="management-description">{DESCRIPTIONS[active]}</p>{error && <p role="alert" className="work-error">{error}</p>}
 {['projects', 'conversations', 'artifacts', 'uploads', 'grants', 'budgets'].includes(active) && <ProjectSelector projectId={projectId} onChange={onProjectChange}/>}
        {active === 'health' ? <HealthPanel /> : active === 'storage' ? <><HealthPanel /><section className="work-data-panel"><h2>PostgreSQL foundation</h2><p>Backend readiness checks the database schema, migrations, runtime role, and pgvector. The canonical readiness response reports only ready or not ready; it does not expose individual database diagnostics.</p><p>Use the repository’s native database verification commands for detailed qualification. No SQL, migration, or credential administration endpoint is exposed.</p><p className="work-hint">No database status is inferred from this frontend loading.</p></section></> : active === 'session' ? <section className="work-data-panel"><div className="work-section-heading"><h2>Owner session</h2><button className="work-secondary" disabled={busy} onClick={async () => { setBusy(true); try {
        await session.recover();
    }
    finally {
        setBusy(false);
    } }}>Refresh session</button></div><dl className="session-facts"><dt>Status</dt><dd>{session.status}</dd><dt>Principal</dt><dd>{session.session?.principalId ?? 'Not connected'}</dd><dt>Workspace</dt><dd>{session.session?.workspaceId ?? 'Not connected'}</dd><dt>Expires</dt><dd>{session.session?.expiresAt ?? 'Not connected'}</dd></dl>{session.session ? <button className="work-secondary" disabled={busy} onClick={() => void disconnect()}>Revoke this session</button> : <p className="work-hint">Open the local gateway with <code>npm run gateway</code>. No manual session setup is needed.</p>}<p className="work-hint">Session credentials stay in memory and an HttpOnly cookie. They are not displayed here.</p></section> : active === 'console' ? <div className="work-console"><ConsolePane /></div> : <RecordWorkspace key={active + projectId + session.status} surface={active} projectId={projectId}/>}
    </div>;
}
