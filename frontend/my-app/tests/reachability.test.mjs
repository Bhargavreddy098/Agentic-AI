import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES, routeKey } from '../lib/api/manifest.ts';
import { COMMANDS } from '../components/console/grammar.ts';
import { ROUTE_FUNCTIONS } from '../lib/api/routes.ts';

// Routes rendered by TreeSidebar's ItemList lists (clickable, not typed).
const SIDEBAR = new Set([
  'GET /workspaces',
  'GET /capabilities',
  'GET /projects',
  'GET /projects/:projectId/artifacts',
  'GET /approvals',
  'GET /providers',
  'GET /models',
  'GET /usage'
]);

// Routes driven by the Connect page via session-store.
const CONNECT_FLOW = new Set(['POST /session/bootstrap', 'GET /session', 'DELETE /session']);

test('every manifest route is reachable from the UI', () => {
  const viaConsole = new Set(COMMANDS.map(c => c.routeKey));
  const unreachable = MANIFEST_ROUTES
    .map(r => routeKey(r.method, r.path))
    .filter(k => !viaConsole.has(k) && !SIDEBAR.has(k) && !CONNECT_FLOW.has(k));

  assert.deepEqual(unreachable, [], 'unreachable routes: ' + unreachable.join(', '));
});

test('every console command points at a real manifest route', () => {
  for (const c of COMMANDS) {
    assert.ok(ROUTE_FUNCTIONS[c.routeKey], `command "${c.name}" -> missing route ${c.routeKey}`);
  }
});

test('console commands cover distinct routes with no duplicates', () => {
  const keys = COMMANDS.map(c => c.routeKey);
  assert.equal(new Set(keys).size, keys.length, 'duplicate command route: ' + keys.filter((k, i) => keys.indexOf(k) !== i));
});

test('reachability count matches the manifest total', () => {
  const viaConsole = new Set(COMMANDS.map(c => c.routeKey));
  const reachable = new Set([...viaConsole, ...SIDEBAR, ...CONNECT_FLOW]);
  for (const r of MANIFEST_ROUTES) assert.ok(reachable.has(routeKey(r.method, r.path)), routeKey(r.method, r.path));
  assert.equal(reachable.size, MANIFEST_ROUTES.length);
});
