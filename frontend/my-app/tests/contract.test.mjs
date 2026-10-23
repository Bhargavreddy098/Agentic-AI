import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES, findRoute, routeKey } from '../lib/api/manifest.ts';
import { ROUTE_FUNCTIONS } from '../lib/api/routes.ts';

test('every manifest route has a typed function', () => {
  for (const r of MANIFEST_ROUTES) {
    const k = routeKey(r.method, r.path);
    assert.equal(typeof ROUTE_FUNCTIONS[k], 'function', 'missing ' + k);
  }
});

test('no function exists for a route outside the manifest', () => {
  for (const k of Object.keys(ROUTE_FUNCTIONS)) {
    const [method, ...rest] = k.split(' ');
    assert.ok(findRoute(method, rest.join(' ')), 'orphan ' + k);
  }
});

test('each function dispatches the manifest method and path', async () => {
  for (const r of MANIFEST_ROUTES) {
    let seen = null;
    const fakeClient = { request: async (route, args) => { seen = { route, args }; return { ok: true, data: null, status: r.successStatus }; } };
    await ROUTE_FUNCTIONS[routeKey(r.method, r.path)](fakeClient, {});
    assert.equal(seen.route.method, r.method);
    assert.equal(seen.route.path, r.path);
  }
});
