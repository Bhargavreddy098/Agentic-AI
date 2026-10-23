"use client";

import { ItemList } from '@/components/stages/item-list';

type ListSpec = { id: string; title: string; method: string; path: string };

const SURFACES: Record<string, ListSpec[]> = {
  overview: [
    { id: 'workspaces', title: 'Workspaces', method: 'GET', path: '/workspaces' },
    { id: 'capabilities', title: 'Capabilities', method: 'GET', path: '/capabilities' }
  ],
  projects: [
    { id: 'projects', title: 'Projects', method: 'GET', path: '/projects' },
    { id: 'artifacts', title: 'Artifacts', method: 'GET', path: '/projects/:projectId/artifacts' }
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

export function TreeSidebar({ active, csrfToken }: { active: string; csrfToken?: string | null }) {
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
    </aside>
  );
}
