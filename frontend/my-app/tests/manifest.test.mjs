import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES, coverage, findRoute, routeKey } from '../lib/api/manifest.ts';

test('manifest routes load with required fields', () => {
  assert.ok(MANIFEST_ROUTES.length > 0);
  for (const r of MANIFEST_ROUTES) {
    assert.equal(typeof r.method, 'string');
    assert.equal(typeof r.path, 'string');
    assert.ok(['unwrapped', 'enveloped', 'none', 'bytes'].includes(r.responseEnvelope), r.path);
  }
});

test('coverage is derived, not constant', () => {
  const c = coverage();
  assert.equal(c.expected, MANIFEST_ROUTES.length);
  assert.equal(c.implemented, MANIFEST_ROUTES.filter(r => r.implemented !== false).length);
  assert.deepEqual(Object.keys(c.byStage).map(Number).sort(), [1, 3, 4, 5, 6]);
});

test('if-match routes are discovered from the manifest', () => {
  const patch = MANIFEST_ROUTES.filter(r => r.ifMatchRequired);
  assert.ok(patch.length > 0);
  assert.ok(patch.every(r => r.method === 'PATCH'));
  for (const r of patch) assert.ok(findRoute('PATCH', r.path), r.path);
});

test('routeKey is stable', () => {
  const r = MANIFEST_ROUTES[0];
  assert.equal(routeKey(r.method, r.path), routeKey(r.method, r.path));
});
