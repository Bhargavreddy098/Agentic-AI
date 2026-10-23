export type CommandSpec = { name: string; routeKey: string; positional: number; flags: string[] };

export const COMMANDS: CommandSpec[] = [
  { name: 'list projects', routeKey: 'GET /projects', positional: 0, flags: ['status', 'cursor', 'limit'] },
  { name: 'create project', routeKey: 'POST /projects', positional: 1, flags: ['kind', 'workspace-root-ref', 'repository-connection-id'] },
  { name: 'patch project', routeKey: 'PATCH /projects/:projectId', positional: 1, flags: ['name', 'description', 'if-match'] },
  { name: 'archive project', routeKey: 'POST /projects/:projectId/archive', positional: 1, flags: ['reason'] },
  { name: 'snapshot project', routeKey: 'POST /projects/:projectId/snapshots', positional: 1, flags: ['include-uncommitted'] },
  { name: 'list conversations', routeKey: 'GET /projects/:projectId/conversations', positional: 1, flags: [] },
  { name: 'create conversation', routeKey: 'POST /projects/:projectId/conversations', positional: 1, flags: ['title'] },
  { name: 'send message', routeKey: 'POST /conversations/:conversationId/messages', positional: 2, flags: ['text'] },
  { name: 'list messages', routeKey: 'GET /conversations/:conversationId/messages', positional: 1, flags: [] },
  { name: 'list artifacts', routeKey: 'GET /projects/:projectId/artifacts', positional: 1, flags: [] },
  { name: 'get approval', routeKey: 'GET /approvals/:approvalId', positional: 1, flags: [] },
  { name: 'list approvals', routeKey: 'GET /approvals', positional: 0, flags: ['project-id', 'state'] },
  { name: 'decide approval', routeKey: 'POST /approvals/:approvalId/decisions', positional: 1, flags: ['decision', 'nonce', 'digest', 'reason'] },
  { name: 'revoke approval', routeKey: 'POST /approvals/:approvalId/revoke', positional: 1, flags: ['reason'] },
  { name: 'list providers', routeKey: 'GET /providers', positional: 0, flags: [] },
  { name: 'create provider', routeKey: 'POST /providers', positional: 1, flags: ['kind', 'endpoint-policy', 'privacy-policy'] },
  { name: 'patch provider', routeKey: 'PATCH /providers/:providerId', positional: 1, flags: ['display-name', 'enabled', 'if-match'] },
  { name: 'discover models', routeKey: 'POST /providers/:providerId/discovery', positional: 1, flags: ['probe', 'budget-ceiling'] },
  { name: 'list models', routeKey: 'GET /models', positional: 0, flags: ['provider-id', 'capability'] },
  { name: 'preview routing', routeKey: 'POST /routing/preview', positional: 0, flags: ['task-type', 'capabilities', 'input-tokens', 'max-output-tokens', 'classification', 'budget-ceiling'] },
  { name: 'get settings', routeKey: 'GET /settings', positional: 0, flags: [] },
  { name: 'patch settings', routeKey: 'PATCH /settings', positional: 0, flags: ['privacy', 'retention', 'default-autonomy', 'limits', 'if-match'] },
  { name: 'list policies', routeKey: 'GET /policies/current', positional: 0, flags: [] },
  { name: 'list grants', routeKey: 'GET /projects/:projectId/grants', positional: 1, flags: [] },
  { name: 'create grant', routeKey: 'POST /projects/:projectId/grants', positional: 1, flags: ['capability', 'resource-scope', 'expires-at'] },
  { name: 'list budgets', routeKey: 'GET /projects/:projectId/budgets', positional: 1, flags: [] },
  { name: 'list usage', routeKey: 'GET /usage', positional: 0, flags: ['project-id', 'run-id', 'from', 'to', 'category'] },
  { name: 'list workspaces', routeKey: 'GET /workspaces', positional: 0, flags: [] },
  { name: 'list capabilities', routeKey: 'GET /capabilities', positional: 0, flags: [] },

  // Stage 1 — health
  { name: 'health live', routeKey: 'GET /health/live', positional: 0, flags: [] },
  { name: 'health ready', routeKey: 'GET /health/ready', positional: 0, flags: [] },

  // Stage 3 — session
  { name: 'get session', routeKey: 'GET /session', positional: 0, flags: [] },
  { name: 'logout', routeKey: 'DELETE /session', positional: 0, flags: [] },
  { name: 'connect session', routeKey: 'POST /session/bootstrap', positional: 0, flags: ['challenge', 'nonce'] },

  // Stage 4 — reads by id
  { name: 'get project', routeKey: 'GET /projects/:projectId', positional: 1, flags: [] },
  { name: 'get conversation', routeKey: 'GET /conversations/:conversationId', positional: 1, flags: [] },
  { name: 'get artifact', routeKey: 'GET /artifacts/:artifactId', positional: 1, flags: [] },
  { name: 'artifact content', routeKey: 'GET /artifacts/:artifactId/content', positional: 1, flags: [] },
  { name: 'export artifact', routeKey: 'POST /artifacts/:artifactId/export', positional: 1, flags: ['destination-ref'] },
  { name: 'get operation', routeKey: 'GET /operations/:operationId', positional: 1, flags: [] },

  // Stage 4 — uploads
  { name: 'create upload', routeKey: 'POST /projects/:projectId/uploads', positional: 1, flags: ['filename', 'media-type', 'bytes', 'digest'] },
  { name: 'upload content', routeKey: 'PUT /uploads/:uploadId/content', positional: 1, flags: ['bytes', 'digest'] },
  { name: 'complete upload', routeKey: 'POST /uploads/:uploadId/complete', positional: 1, flags: ['digest'] },

  // Stage 5 — write paths
  { name: 'create policy revision', routeKey: 'POST /policies/revisions', positional: 0, flags: ['base-revision-id', 'rules', 'reason'] },
  { name: 'activate policy', routeKey: 'POST /policies/:revisionId/activate', positional: 1, flags: ['digest'] },
  { name: 'revoke grant', routeKey: 'POST /grants/:grantId/revoke', positional: 1, flags: ['reason'] },
  { name: 'request approval', routeKey: 'POST /contract-revisions/:revisionId/approval-requests', positional: 1, flags: ['digest'] },
  { name: 'create budget', routeKey: 'POST /projects/:projectId/budgets', positional: 1, flags: ['scope-kind', 'run-id', 'limit-micro-usd', 'reason'] },
  { name: 'patch budget', routeKey: 'PATCH /budgets/:budgetId', positional: 1, flags: ['limit-micro-usd', 'reason', 'if-match'] },

  // Stage 6 — read by id
  { name: 'get provider', routeKey: 'GET /providers/:providerId', positional: 1, flags: [] }
];

export function commandsForSurface(surface: string): CommandSpec[] {
  const map: Record<string, string[]> = {
    projects: ['list projects', 'create project', 'patch project', 'archive project', 'snapshot project', 'list conversations', 'create conversation', 'send message', 'list messages', 'list artifacts', 'list grants', 'create grant', 'list budgets'],
    approvals: ['list approvals', 'get approval', 'decide approval', 'revoke approval'],
    providers: ['list providers', 'create provider', 'patch provider', 'discover models', 'list models', 'preview routing'],
    usage: ['list usage'],
    overview: ['list workspaces', 'list capabilities', 'get settings', 'patch settings', 'list policies']
  };
  const names = map[surface] ?? [];
  return COMMANDS.filter(c => names.includes(c.name));
}
