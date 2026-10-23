import { MANIFEST_ROUTES, routeKey } from './manifest.ts';
import { COMMANDS } from '../../components/console/grammar.ts';

// Routes the Connect page drives through session-store rather than a command.
const CONNECT_FLOW = new Set(['POST /session/bootstrap', 'GET /session', 'DELETE /session']);

// Routes rendered as lists or scoped panes in TreeSidebar.
const SIDEBAR = new Set([
  'GET /workspaces',
  'GET /capabilities',
  'GET /projects',
  'GET /projects/:projectId/artifacts',
  'GET /projects/:projectId/conversations',
  'GET /projects/:projectId/budgets',
  'GET /projects/:projectId/grants',
  'GET /approvals',
  'GET /providers',
  'GET /models',
  'GET /usage'
]);

export type Reach = { reachable: number; total: number; backend: number; missing: string[] };

/**
 * Frontend reachability, derived from what the UI can actually invoke.
 * This is NOT the manifest's `implemented` count: that describes the backend.
 */
export function frontendReach(): Reach {
  const viaConsole = new Set(COMMANDS.map(c => c.routeKey));
  const total = MANIFEST_ROUTES.length;
  const missing: string[] = [];
  let reachable = 0;

  for (const route of MANIFEST_ROUTES) {
    const k = routeKey(route.method, route.path);
    if (viaConsole.has(k) || SIDEBAR.has(k) || CONNECT_FLOW.has(k)) reachable++;
    else missing.push(k);
  }

  const backend = MANIFEST_ROUTES.filter(r => r.implemented !== false).length;
  return { reachable, total, backend, missing };
}

export function formatStageRange(byStage: Record<number, number>): string {
  const stages = Object.keys(byStage).map(Number).sort((a, b) => a - b);
  if (!stages.length) return 'Stage ?';
  const lo = stages[0].toString().padStart(2, '0');
  const hi = stages[stages.length - 1].toString().padStart(2, '0');
  return lo === hi ? `Stage ${lo}` : `Stage ${lo}–${hi}`;
}
