const paramsFor = route => Object.fromEntries([...route.path.matchAll(/:([A-Za-z]+)/g)].map(m=>[m[1],'11111111-1111-4111-8111-111111111111']));
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES } from '../lib/api/manifest.ts';
import { createClient } from '../lib/api/client.ts';

// Exercises every route through the real transport with a stubbed fetch,
// proving header/credential rules hold for all 50 routes without mutating anything.
const CSRF = 'csrf-token-value';
const IFMATCH = '"1"';

test('all routes send credentials and never an Origin header', async () => {
  for (const route of MANIFEST_ROUTES) {
    let captured = null;
    const transport = async (url, init) => {
      captured = { url, init };
      return { ok: true, status: route.successStatus, json: async () => ({ data: null }), arrayBuffer: async () => new ArrayBuffer(0), headers: { get: () => null } };
    };
    const client = createClient({ transport, getCsrfToken: () => CSRF, onUnauthorized() {}, onLog() {} });
    await client.request(route, { pathParams: paramsFor(route), ifMatch: IFMATCH, body: route.method === 'GET' ? undefined : {} });

    assert.equal(captured.init.credentials, 'include', route.path);
    const keys = Object.keys(captured.init.headers).map(h => h.toLowerCase());
    assert.equal(keys.includes('origin'), false, route.path);

    if (route.csrfRequired) assert.equal(captured.init.headers['X-CSRF-Token'], CSRF, route.path);
    else assert.equal(captured.init.headers['X-CSRF-Token'], undefined, route.path);

    if (route.ifMatchRequired) assert.equal(captured.init.headers['If-Match'], IFMATCH, route.path);
    else assert.equal(captured.init.headers['If-Match'], undefined, route.path);

    if (route.idempotencyKeyRequired) assert.ok(captured.init.headers['Idempotency-Key'], route.path);
    else assert.equal(captured.init.headers['Idempotency-Key'], undefined, route.path);
  }
});

test('a PATCH without If-Match is refused before any request', async () => {
  for (const route of MANIFEST_ROUTES.filter(r => r.ifMatchRequired)) {
    let called = false;
    const client = createClient({ transport: async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; }, getCsrfToken: () => CSRF, onUnauthorized() {}, onLog() {} });
    const res = await client.request(route, { body: {}, pathParams: paramsFor(route) });
    assert.equal(res.ok, false, route.path);
    assert.equal(called, false, route.path);
  }
});
