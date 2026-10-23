import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody } from '../components/console/bodies.ts';
import { resolveApiOrigin } from '../lib/api/config.ts';
import { frontendReach } from '../lib/api/status.ts';

const R = (method, path) => ({ method, path });

// ---- budgets: decimal strings, per governance.routes.js createBudget/updateBudget ----

test('create budget sends limitMicroUsd as a decimal string', () => {
  const b = buildBody(R('POST', '/projects/:projectId/budgets'), ['p1'], { 'scope-kind': 'project', 'limit-micro-usd': '500', reason: 'test' });
  assert.equal(b.kind, 'json');
  assert.equal(typeof b.body.limitMicroUsd, 'string');
  assert.equal(b.body.limitMicroUsd, '500');
});

test('patch budget sends limitMicroUsd as a decimal string', () => {
  const b = buildBody(R('PATCH', '/budgets/:budgetId'), ['b1'], { 'limit-micro-usd': '900', reason: 'raise' });
  assert.equal(typeof b.body.limitMicroUsd, 'string');
});

test('budget rejects a non-decimal amount instead of coercing', () => {
  const b = buildBody(R('PATCH', '/budgets/:budgetId'), ['b1'], { 'limit-micro-usd': '9.5', reason: 'x' });
  assert.ok(b.error, 'should refuse non-integer amount');
});

test('run-scoped budget requires run id', () => {
  const b = buildBody(R('POST', '/projects/:projectId/budgets'), ['p1'], { 'scope-kind': 'run', 'limit-micro-usd': '10', reason: 'x' });
  assert.ok(b.error && /run-id/.test(b.error));
});

// ---- settings: body builder now exists ----

test('patch settings builds a retention object', () => {
  const retention = JSON.stringify({ diagnosticLogDays: 30, sseEventDays: 30, temporaryUploadHours: 24, failedWorkspaceDays: 7 });
  const b = buildBody(R('PATCH', '/settings'), [], { retention });
  assert.equal(b.kind, 'json');
  assert.equal(b.body.retention.diagnosticLogDays, 30);
});

test('patch settings rejects non-JSON retention', () => {
  const b = buildBody(R('PATCH', '/settings'), [], { retention: 'thirty' });
  assert.ok(b.error && /JSON/.test(b.error));
});

test('patch settings with no fields is refused', () => {
  assert.ok(buildBody(R('PATCH', '/settings'), [], {}).error);
});

// ---- providers: nested objects, not strings ----

test('create provider sends endpointPolicy as an object', () => {
  const b = buildBody(R('POST', '/providers'), ['Compat'], {
    kind: 'openai_compatible',
    'endpoint-policy': JSON.stringify({ baseUrl: 'https://api.example.com' }),
    'privacy-policy': JSON.stringify({ allowedClassifications: ['internal'], providerTraining: false, retention: 'none' })
  });
  assert.equal(typeof b.body.endpointPolicy, 'object');
  assert.equal(b.body.endpointPolicy.baseUrl, 'https://api.example.com');
  assert.equal(typeof b.body.privacyPolicy, 'object');
});

test('create provider rejects a string endpoint policy', () => {
  const b = buildBody(R('POST', '/providers'), ['x'], { kind: 'openai', 'endpoint-policy': 'https://x', 'privacy-policy': '{}' });
  assert.ok(b.error && /JSON/.test(b.error));
});

// ---- grants: resourceScope as object ----

test('create grant sends resourceScope as an object', () => {
  const b = buildBody(R('POST', '/projects/:projectId/grants'), ['p1'], {
    capability: 'files.read', 'resource-scope': JSON.stringify({ paths: ['src'] }), 'expires-at': '2030-01-01T00:00:00.000Z'
  });
  assert.equal(typeof b.body.resourceScope, 'object');
  assert.deepEqual(b.body.resourceScope.paths, ['src']);
});

test('create grant rejects a string resource scope', () => {
  const b = buildBody(R('POST', '/projects/:projectId/grants'), ['p1'], { capability: 'files.read', 'resource-scope': 'src', 'expires-at': '2030-01-01T00:00:00.000Z' });
  assert.ok(b.error);
});

// ---- uploads: raw bytes, not JSON ----

test('upload content produces raw bytes, never JSON', () => {
  const b = buildBody(R('PUT', '/uploads/:uploadId/content'), ['u1'], { bytes: '4' });
  assert.equal(b.kind, 'bytes');
  assert.ok(b.bytes instanceof Uint8Array);
  assert.equal(b.bytes.byteLength, 4);
});

test('upload content refuses without a byte source', () => {
  assert.ok(buildBody(R('PUT', '/uploads/:uploadId/content'), ['u1'], {}).error);
});

// ---- routing preview: contract-shaped ----

test('routing preview sends a decimal-string budget ceiling', () => {
  const b = buildBody(R('POST', '/routing/preview'), [], {
    'task-type': 'planning', capabilities: 'text.completion', classification: 'internal', 'budget-ceiling': '10000'
  });
  assert.equal(typeof b.body.budgetCeilingMicroUsd, 'string');
  assert.deepEqual(b.body.capabilities, ['text.completion']);
});

test('routing preview rejects a capability shorter than 3 chars', () => {
  // Backend regex is ^[a-z][a-z0-9_.:-]{2,127}$ — "ab" is invalid, "abc" is valid.
  const bad = buildBody(R('POST', '/routing/preview'), [], {
    'task-type': 'planning', capabilities: 'ab', classification: 'internal', 'budget-ceiling': '1'
  });
  assert.ok(bad.error && /capability/.test(bad.error), 'ab must be rejected');

  const good = buildBody(R('POST', '/routing/preview'), [], {
    'task-type': 'planning', capabilities: 'abc', classification: 'internal', 'budget-ceiling': '1'
  });
  assert.equal(good.kind, 'json', 'abc must be accepted');
});

test('routing preview rejects an unknown classification', () => {
  const b = buildBody(R('POST', '/routing/preview'), [], {
    'task-type': 'p', capabilities: 'text.completion', classification: 'secret', 'budget-ceiling': '1'
  });
  assert.ok(b.error);
});

// ---- origin resolution ----

test('explicit ASI_API_ORIGIN always wins', () => {
  assert.equal(resolveApiOrigin({ ASI_API_ORIGIN: 'http://127.0.0.1:3100', PORT: '3000' }), 'http://127.0.0.1:3100');
});

test('backend port is used when explicitly named', () => {
  assert.equal(resolveApiOrigin({ ASI_PORT: '3100' }), 'http://127.0.0.1:3100');
  assert.equal(resolveApiOrigin({ BACKEND_PORT: '3100' }), 'http://127.0.0.1:3100');
});

test('generic PORT is never treated as the backend port', () => {
  assert.equal(resolveApiOrigin({ PORT: '3000' }), 'http://127.0.0.1:4400');
});

// ---- coverage honesty ----

test('frontend reachability is derived separately from the backend count', () => {
  const r = frontendReach();
  assert.equal(r.total, r.reachable + r.missing.length);
  assert.equal(r.backend, r.total);
});
