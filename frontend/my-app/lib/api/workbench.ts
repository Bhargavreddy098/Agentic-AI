import { COMMANDS, type CommandSpec } from '../../components/console/grammar.ts';
import { buildBody } from '../../components/console/bodies.ts';
import { buildQuery } from '../../components/console/query.ts';
import { findRoute } from './manifest.ts';
import { SURFACES, type SurfaceId } from './surfaces.ts';
import { beginOperation, buildHeaders } from './requirements.ts';
import { SENSITIVE_KEYS } from './log.ts';
import type { RequestOptions } from './client.ts';

export const DESCRIPTIONS: Record<SurfaceId | 'storage' | 'console', string> = {
  health: 'Check process liveness and whether backend dependencies are ready.',
  storage: 'PostgreSQL readiness is verified by the backend. Database administration stays in the trusted local tools.',
  session: 'Manage your local owner connection and session expiry.',
  workspaces: 'Browse the workspaces available to your authenticated owner.',
  capabilities: 'See which capabilities are available and why others are disabled.',
  projects: 'Create a project, inspect its details, and manage repository snapshots.',
  conversations: 'Open a project conversation, read its messages, or send a message.',
  artifacts: 'Inspect project artifacts, download authorized content, and request native exports.',
  uploads: 'Upload a real file to a project. Accepted uploads remain subject to quarantine.',
  operations: 'Read an operation’s recorded state. Acceptance does not mean completion.',
  policies: 'Review active rules, create an immutable revision, and activate an exact digest.',
  grants: 'Inspect and manage the capabilities granted within the selected project.',
  approvals: 'Review exact approval requests and record an owner decision.',
  budgets: 'Set project spending ceilings and inspect existing reservations.',
  settings: 'Manage preferences. Active policy remains authoritative for privacy and limits.',
  usage: 'Browse recorded usage and costs with optional scope and date filters.',
  providers: 'Manage provider configuration and discover registered models.',
  models: 'Browse model capabilities, availability, and qualification records.',
  routing: 'Preview model eligibility under policy and budget constraints. No generation call is made.',
  console: 'Advanced access to the same verified API through commands.',
};

export function actionsFor(id: string): CommandSpec[] {
  const keys = SURFACES.find(s => s.id === id)?.owns ?? [];
  return keys.flatMap(key => COMMANDS.filter(c => c.routeKey === key));
}

export function identifiers(path: string): string[] {
  return [...path.matchAll(/:([a-zA-Z]+)/g)].map(m => m[1]);
}

export function scopedParams(path: string, projectId: string): Record<string, string> {
  if (path.includes(':projectId')) {
    if (!isUuid(projectId)) throw new Error('Choose a project before loading project records.');
    return { projectId };
  }
  return {};
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function prepareAction(command: CommandSpec, values: Record<string, string>, csrfToken: string | null, bytes?: Uint8Array) {
  const [method, path] = command.routeKey.split(' ');
  const route = findRoute(method, path);
  if (!route) throw new Error('This action is not in the approved API manifest.');
  const pathParams: Record<string, string> = {};
  for (const key of identifiers(path)) {
    if (!isUuid(values[key] ?? '')) throw new Error(`A valid ${key.replace(/Id$/, ' ID')} is required.`);
    pathParams[key] = values[key];
  }
  const flags = Object.fromEntries(command.flags.filter(k => values[k] !== undefined && values[k] !== '').map(k => [k, values[k]]));
  const positional = identifiers(path).map(k => values[k]);
  if (command.positional && !positional.length) {
    if (!values.name?.trim()) throw new Error('Name is required.');
    positional.push(values.name.trim());
  }
  const built = buildBody(route, positional, flags, bytes);
  if ('error' in built) throw new Error(built.error);
  const operation = beginOperation(route);
  const ifMatch = values['if-match'];
  const { refusal } = buildHeaders(route, operation, { csrfToken, ifMatch });
  if (refusal) throw new Error(refusal);
  const options: RequestOptions = { pathParams, query: buildQuery(route, flags), operation, ifMatch };
  if (built.kind === 'json') options.body = built.body;
  if (built.kind === 'bytes') options.rawBody = built.bytes;
  return { route, options };
}

export function safeDisplay(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDisplay);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE_KEYS.some(s => s.toLowerCase() === k.toLowerCase()) ? '[redacted]' : safeDisplay(v)]));
  return value;
}

export function recordRows(value: unknown): Record<string, unknown>[] | null {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' && 'items' in value ? (value as { items: unknown }).items : null;
  if (!Array.isArray(rows)) return null;
  return rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r));
}

export function recordTitle(row: Record<string, unknown>) {
  return String(row.name ?? row.displayName ?? row.title ?? row.externalModelId ?? row.text ?? row.capability ?? row.id ?? 'Record');
}
