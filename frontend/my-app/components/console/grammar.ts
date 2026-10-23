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
  { name: 'list capabilities', routeKey: 'GET /capabilities', positional: 0, flags: [] }
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
