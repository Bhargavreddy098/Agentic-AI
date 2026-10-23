import { MANIFEST_ROUTES, routeKey } from './manifest.ts';
import type { ApiRoute } from './types.ts';

export type SurfaceId = 'health' | 'session' | 'workspaces' | 'capabilities' | 'projects' | 'conversations' | 'artifacts' | 'uploads' | 'operations' | 'policies' | 'grants' | 'approvals' | 'budgets' | 'settings' | 'usage' | 'providers' | 'models' | 'routing';

export type Surface = { id: SurfaceId; stage: number; label: string; owns: string[] };

export const SURFACES: Surface[] = [
  { id: 'health', stage: 1, label: 'Health', owns: ['GET /health/live', 'GET /health/ready'] },
  { id: 'session', stage: 3, label: 'Session', owns: ['GET /session', 'DELETE /session', 'POST /session/bootstrap'] },
  { id: 'workspaces', stage: 3, label: 'Workspaces', owns: ['GET /workspaces'] },
  { id: 'capabilities', stage: 3, label: 'Capabilities', owns: ['GET /capabilities'] },
  { id: 'projects', stage: 4, label: 'Projects', owns: ['GET /projects', 'POST /projects', 'GET /projects/:projectId', 'PATCH /projects/:projectId', 'POST /projects/:projectId/archive', 'POST /projects/:projectId/snapshots'] },
  { id: 'conversations', stage: 4, label: 'Conversations', owns: ['GET /projects/:projectId/conversations', 'POST /projects/:projectId/conversations', 'GET /conversations/:conversationId', 'GET /conversations/:conversationId/messages', 'POST /conversations/:conversationId/messages'] },
  { id: 'artifacts', stage: 4, label: 'Artifacts', owns: ['GET /projects/:projectId/artifacts', 'GET /artifacts/:artifactId', 'GET /artifacts/:artifactId/content', 'POST /artifacts/:artifactId/export'] },
  { id: 'uploads', stage: 4, label: 'Uploads', owns: ['POST /projects/:projectId/uploads', 'PUT /uploads/:uploadId/content', 'POST /uploads/:uploadId/complete'] },
  { id: 'operations', stage: 4, label: 'Operations', owns: ['GET /operations/:operationId'] },
  { id: 'policies', stage: 5, label: 'Policies', owns: ['GET /policies/current', 'POST /policies/revisions', 'POST /policies/:revisionId/activate'] },
  { id: 'grants', stage: 5, label: 'Grants', owns: ['GET /projects/:projectId/grants', 'POST /projects/:projectId/grants', 'POST /grants/:grantId/revoke'] },
  { id: 'approvals', stage: 5, label: 'Approvals', owns: ['POST /contract-revisions/:revisionId/approval-requests', 'GET /approvals', 'GET /approvals/:approvalId', 'POST /approvals/:approvalId/decisions', 'POST /approvals/:approvalId/revoke'] },
  { id: 'budgets', stage: 5, label: 'Budgets', owns: ['GET /projects/:projectId/budgets', 'POST /projects/:projectId/budgets', 'PATCH /budgets/:budgetId'] },
  { id: 'settings', stage: 5, label: 'Settings', owns: ['GET /settings', 'PATCH /settings'] },
  { id: 'usage', stage: 5, label: 'Usage', owns: ['GET /usage'] },
  { id: 'providers', stage: 6, label: 'Providers', owns: ['GET /providers', 'POST /providers', 'GET /providers/:providerId', 'PATCH /providers/:providerId', 'POST /providers/:providerId/discovery'] },
  { id: 'models', stage: 6, label: 'Models', owns: ['GET /models'] },
  { id: 'routing', stage: 6, label: 'Routing', owns: ['POST /routing/preview'] }
];

export function validateCoverage(): { missing: ApiRoute[]; duplicated: string[]; byStage: Record<number, number> } {
  const owned = new Map<string, number>();
  for (const s of SURFACES) for (const k of s.owns) owned.set(k, (owned.get(k) ?? 0) + 1);

  const duplicated = [...owned.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const missing = MANIFEST_ROUTES.filter(r => !owned.has(routeKey(r.method, r.path)));

  const byStage: Record<number, number> = {};
  for (const s of SURFACES) byStage[s.stage] = (byStage[s.stage] ?? 0) + s.owns.length;

  return { missing, duplicated, byStage };
}
