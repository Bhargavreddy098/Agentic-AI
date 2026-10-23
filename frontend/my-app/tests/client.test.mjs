const paramsFor = route => Object.fromEntries([...route.path.matchAll(/:([A-Za-z]+)/g)].map(m=>[m[1],'11111111-1111-4111-8111-111111111111']));
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MANIFEST_ROUTES } from '../lib/api/manifest.ts';
import { beginOperation, buildHeaders } from '../lib/api/requirements.ts';
import { createClient } from '../lib/api/client.ts';
import { unwrapEnvelope } from '../lib/api/envelope.ts';
import { parseProblem } from '../lib/api/problem.ts';
import { makeRecord, redactPath, SENSITIVE_KEYS } from '../lib/api/log.ts';
import { createSessionStore } from '../lib/session/session-store.ts';

// ---- session ----

test('refresh recovers session through GET /api/v1/session', async () => {
  const calls = [];
  const transport = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ data: { principalId: 'p', workspaceId: 'w', expiresAt: '2030-01-01T00:00:00.000Z', csrfToken: 't' } }) }; };
  const s = createSessionStore({ transport });
  await s.recover();
  assert.equal(calls[0], '/api/v1/session');
  assert.equal(s.get().status, 'connected');
});

test('401 clears session state', async () => {
  const s = createSessionStore({ transport: async () => ({ ok: false, status: 401, json: async () => ({}) }) });
  await s.recover();
  assert.equal(s.get().status, 'disconnected');
  assert.equal(s.get().session, null);
});

test('session is never written to browser storage', async () => {
  const stored = [];
  const s = createSessionStore({
    storage: { setItem: (...a) => stored.push(a) },
    transport: async () => ({ ok: true, status: 200, json: async () => ({ data: { principalId: 'p', workspaceId: 'w', expiresAt: '2030-01-01T00:00:00.000Z', csrfToken: 't' } }) })
  });
  await s.recover();
  assert.equal(stored.length, 0);
});

// ---- envelope ----

test('enveloped response surfaces data and meta', async () => {
  const r = await unwrapEnvelope('enveloped', { status: 200, json: async () => ({ data: [{ id: 1 }], meta: { requestId: 'r1', nextCursor: 'c2' } }) });
  assert.deepEqual(r.data, [{ id: 1 }]);
  assert.equal(r.meta.nextCursor, 'c2');
});

test('unwrapped response returns body as-is', async () => {
  const r = await unwrapEnvelope('unwrapped', { status: 200, json: async () => ({ ready: true }) });
  assert.deepEqual(r.data, { ready: true });
});

test('no-body response yields null', async () => {
  const r = await unwrapEnvelope('none', { status: 204 });
  assert.equal(r.data, null);
});

test('problem is parsed with code and retryability', () => {
  const p = parseProblem(409, { type: 'x', title: 'APPROVAL_DIGEST_MISMATCH', status: 409, code: 'APPROVAL_DIGEST_MISMATCH', detail: 'stale' });
  assert.equal(p.code, 'APPROVAL_DIGEST_MISMATCH');
  assert.equal(p.retryable, false);
  assert.equal(parseProblem(503, {}).retryable, true);
});

// ---- requirements ----

test('csrf attached exactly when declared', () => {
  const r = MANIFEST_ROUTES.find(x => x.csrfRequired);
  const { headers } = buildHeaders(r, beginOperation(r), { csrfToken: 'tok' });
  assert.equal(headers['X-CSRF-Token'], 'tok');
  const g = MANIFEST_ROUTES.find(x => !x.csrfRequired);
  assert.equal(buildHeaders(g, beginOperation(g), { csrfToken: 'tok' }).headers['X-CSRF-Token'], undefined);
});

test('no Origin header is ever set', () => {
  for (const r of MANIFEST_ROUTES) {
    const { headers } = buildHeaders(r, beginOperation(r), { csrfToken: 't', ifMatch: 'v' });
    assert.equal(Object.keys(headers).some(h => h.toLowerCase() === 'origin'), false, r.path);
  }
});

test('If-Match refusal when the manifest requires it and none supplied', () => {
  const r = MANIFEST_ROUTES.find(x => x.ifMatchRequired);
  const res = buildHeaders(r, beginOperation(r), { csrfToken: 't' });
  assert.ok(res.refusal);
  assert.equal(res.headers['If-Match'], undefined);
});

test('If-Match sent when supplied', () => {
  const r = MANIFEST_ROUTES.find(x => x.ifMatchRequired);
  assert.equal(buildHeaders(r, beginOperation(r), { csrfToken: 't', ifMatch: '1' }).headers['If-Match'], '"1"');
});

test('idempotency key only where required', () => {
  const yes = MANIFEST_ROUTES.find(x => x.idempotencyKeyRequired);
  const no = MANIFEST_ROUTES.find(x => !x.idempotencyKeyRequired);
  assert.ok(beginOperation(yes).idempotencyKey);
  assert.equal(beginOperation(no).idempotencyKey, null);
});

// ---- client retry ----

test('a retried logical operation reuses one idempotency key', async () => {
  const seen = [];
  let attempt = 0;
  const transport = async (url, init) => {
    seen.push(init.headers['Idempotency-Key']);
    attempt++;
    if (attempt === 1) throw new TypeError('network');
    return { ok: true, status: 201, json: async () => ({ data: { id: 'x' } }) };
  };
  const client = createClient({ transport, getCsrfToken: () => 't' });
  const route = MANIFEST_ROUTES.find(r => r.idempotencyKeyRequired && r.method === 'POST');
  const res = await client.request(route, { body: {}, pathParams: paramsFor(route) });
  assert.equal(res.ok, true);
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1]);
});

test('a new operation gets a new key', async () => {
  const keys = [];
  const transport = async (u, init) => { keys.push(init.headers['Idempotency-Key']); return { ok: true, status: 201, json: async () => ({ data: {} }) }; };
  const client = createClient({ transport, getCsrfToken: () => 't' });
  const route = MANIFEST_ROUTES.find(r => r.idempotencyKeyRequired && r.method === 'POST');
  await client.request(route, { body: {}, pathParams: paramsFor(route) });
  await client.request(route, { body: {}, pathParams: paramsFor(route) });
  assert.notEqual(keys[0], keys[1]);
});

test('401 triggers onUnauthorized', async () => {
  let called = false;
  const client = createClient({ transport: async () => ({ ok: false, status: 401, json: async () => ({}) }), getCsrfToken: () => 't', onUnauthorized: () => { called = true; } });
  await client.request(MANIFEST_ROUTES.find(r => r.method === 'GET'), {});
  assert.equal(called, true);
});

// ---- log redaction ----

test('request log drops sensitive fields', () => {
  const rec = makeRecord({ method: 'POST', path: '/api/v1/approvals/8b1d/decisions', status: 200, latencyMs: 3, requestId: 'r', contentType: 'application/json', cookie: 'asi_local_session=abc', authorization: 'Bearer x', csrfToken: 'tok', challenge: 'c'.repeat(43), apiKey: 'sk-live' });
  const text = JSON.stringify(rec);
  for (const leak of ['asi_local_session', 'Bearer', 'tok', 'c'.repeat(43), 'sk-live']) assert.equal(text.includes(leak), false, leak);
});

test('paths are redacted to templates', () => {
  assert.equal(redactPath('/api/v1/approvals/8b1d3f2a-1111-2222-3333-444455556666/decisions'), '/api/v1/approvals/:param/decisions');
});

test('all sensitive keys are listed for the audit', () => {
  assert.ok(SENSITIVE_KEYS.includes('x-csrf-token'));
  assert.ok(SENSITIVE_KEYS.includes('idempotency-key'));
});
