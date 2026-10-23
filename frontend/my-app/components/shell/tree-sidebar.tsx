"use client";

import { useEffect, useState } from 'react';
import { ItemList } from '@/components/stages/item-list';
import { createClient } from '@/lib/api/client';
import { findRoute } from '@/lib/api/manifest';

type ListSpec = { id: string; title: string; method: string; path: string };

const SURFACES: Record<string, ListSpec[]> = {
  overview: [
    { id: 'workspaces', title: 'Workspaces', method: 'GET', path: '/workspaces' },
    { id: 'capabilities', title: 'Capabilities', method: 'GET', path: '/capabilities' }
  ],
  projects: [
    { id: 'projects', title: 'Projects', method: 'GET', path: '/projects' }
  ],
  approvals: [
    { id: 'approvals', title: 'Approvals', method: 'GET', path: '/approvals' }
  ],
  providers: [
    { id: 'providers', title: 'Providers', method: 'GET', path: '/providers' },
    { id: 'models', title: 'Models', method: 'GET', path: '/models' }
  ],
  usage: [
    { id: 'usage', title: 'Usage', method: 'GET', path: '/usage' }
  ]
};

function ProjectPicker({ csrfToken, onPick }: { csrfToken: string; onPick: (id: string) => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    const route = findRoute('GET', '/projects');
    if (!route) return;
    createClient({ getCsrfToken: () => csrfToken }).request(route, {}).then((res: any) => {
      if (!res.ok) return;
      const d = res.data;
      const list = Array.isArray(d) ? d : (d?.items ?? []);
      setProjects(list.map((p: any) => ({ id: String(p.id), name: String(p.name ?? 'Untitled') })));
    });
  }, [csrfToken]);

  if (!projects.length) return <p className="text-xs text-muted-foreground p-2">No projects to scope this to.</p>;
  return (
    <ul className="text-xs">
      {projects.map(p => (
        <li key={p.id}>
          <button className="w-full text-left p-2 hover:bg-muted truncate" onClick={() => onPick(p.id)}>{p.name}</button>
        </li>
      ))}
    </ul>
  );
}

export function TreeSidebar({ active, csrfToken }: { active: string; csrfToken?: string | null }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const lists = SURFACES[active] ?? [];

  if (!lists.length) {
    return <aside className="w-64 border-r p-2 text-xs text-muted-foreground">No records on this surface.</aside>;
  }

  return (
    <aside className="w-64 border-r overflow-auto">
      {lists.map(l => (
        <section key={l.id} className="border-b">
          <h2 className="text-xs font-semibold px-2 py-1 bg-muted">{l.title}</h2>
          <ItemList method={l.method} path={l.path} csrfToken={csrfToken} label={l.title.toLowerCase()} />
        </section>
      ))}

      {/* Project-scoped lists need an explicit project; never call them without one. */}
      <section className="border-b">
        <h2 className="text-xs font-semibold px-2 py-1 bg-muted">
          Project records {projectId ? <span className="font-normal opacity-60">· {projectId.slice(0, 8)}</span> : null}
        </h2>
        {!csrfToken ? (
          <p className="text-xs text-muted-foreground p-2">Connect a session to browse project records.</p>
        ) : !projectId ? (
          <ProjectPicker csrfToken={csrfToken} onPick={setProjectId} />
        ) : (
          <>
            <div className="px-2 pt-1">
              <button className="text-[11px] underline opacity-70" onClick={() => setProjectId(null)}>change project</button>
            </div>
            <h3 className="text-[11px] font-semibold px-2 pt-2 pb-1 opacity-70">Artifacts</h3>
            <ItemList method="GET" path="/projects/:projectId/artifacts" pathParams={{ projectId }} csrfToken={csrfToken} label="artifacts" />
            <h3 className="text-[11px] font-semibold px-2 pt-2 pb-1 opacity-70">Conversations</h3>
            <ItemList method="GET" path="/projects/:projectId/conversations" pathParams={{ projectId }} csrfToken={csrfToken} label="conversations" />
            <h3 className="text-[11px] font-semibold px-2 pt-2 pb-1 opacity-70">Budgets</h3>
            <ItemList method="GET" path="/projects/:projectId/budgets" pathParams={{ projectId }} csrfToken={csrfToken} label="budgets" />
            <h3 className="text-[11px] font-semibold px-2 pt-2 pb-1 opacity-70">Grants</h3>
            <ItemList method="GET" path="/projects/:projectId/grants" pathParams={{ projectId }} csrfToken={csrfToken} label="grants" />
          </>
        )}
      </section>
    </aside>
  );
}
