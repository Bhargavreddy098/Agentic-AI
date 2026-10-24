import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionsFor, prepareAction, scopedParams, safeDisplay } from '../lib/api/workbench.ts';
import { SURFACES } from '../lib/api/surfaces.ts';
import { createClient } from '../lib/api/client.ts';

const project = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const command = (surface, name) => actionsFor(surface).find(c => c.name === name);

test('every visible surface action resolves to its approved route, including scopes', () => {
  for (const surface of SURFACES) assert.deepEqual(actionsFor(surface.id).map(c => c.routeKey).sort(), [...surface.owns].sort());
  assert.deepEqual(actionsFor('storage'), []);
});

test('project lists refuse absent scope and never substitute a different project', async () => {
  assert.throws(() => scopedParams('/projects/:projectId/artifacts', ''), /Choose a project/);
  assert.throws(() => prepareAction(command('conversations', 'list conversations'), {}, 'csrf'), /valid project/);
  const calls = [];
  const client = createClient({ transport: async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 }); } });
  for (const id of [project, other]) {
    const packet = prepareAction(command('artifacts', 'list artifacts'), { projectId: id, limit: '25', cursor: 'opaque-cursor' }, 'csrf');
    await client.request(packet.route, packet.options);
  }
  assert.equal(calls[0].url, `/api/v1/projects/${project}/artifacts?limit=25&cursor=opaque-cursor`);
  assert.equal(calls[1].url, `/api/v1/projects/${other}/artifacts?limit=25&cursor=opaque-cursor`);
});

test('review packet pins exact decimal budgets and the record version across retries', async () => {
  assert.throws(() => prepareAction(command('budgets', 'patch budget'), { budgetId: project, 'limit-micro-usd': '9007199254740993', reason: 'Reviewed' }, 'csrf'), /If-Match/);
  const packet = prepareAction(command('budgets', 'patch budget'), { budgetId: project, 'limit-micro-usd': '9007199254740993', reason: 'Reviewed', 'if-match': '7' }, 'csrf');
  const attempts = [];
  const client = createClient({ getCsrfToken: () => 'csrf', transport: async (url, opts) => {
    attempts.push({ url, opts });
    if (attempts.length === 1) throw new Error('Network interruption');
    return new Response(JSON.stringify({ data: { id: project, version: '8' }, meta: { version: '8' } }), { status: 200 });
  } });
  const result = await client.request(packet.route, packet.options);
  assert.equal(result.ok, true);
  assert.equal(attempts[0].opts.headers['Idempotency-Key'], attempts[1].opts.headers['Idempotency-Key']);
  assert.equal(attempts[0].opts.headers['If-Match'], '"7"');
  assert.equal(attempts[0].opts.headers['X-CSRF-Token'], 'csrf');
  assert.equal(JSON.parse(attempts[0].opts.body).limitMicroUsd, '9007199254740993');
});

test('message forms preserve text and attachments and reject missing conversation IDs', () => {
  const c = command('conversations', 'send message');
  assert.throws(() => prepareAction(c, { text: 'hello' }, 'csrf'), /conversation/);
  const { options } = prepareAction(c, { conversationId: project, text: 'hello\nworld', 'attachment-ids': other }, 'csrf');
  assert.deepEqual(options.body, { text: 'hello\nworld', attachmentIds: [other] });
});

test('raw upload form requires selected bytes and preserves them unchanged', () => {
  const c = command('uploads', 'upload content');
  assert.throws(() => prepareAction(c, { uploadId: project }, 'csrf'), /real file/);
  const bytes = new Uint8Array([0, 127, 255]);
  assert.equal(prepareAction(c, { uploadId: project }, 'csrf', bytes).options.rawBody, bytes);
});

test('review output redacts nested session and credential references without mutating input', () => {
  const input = { privacy: { denyEgress: true }, rows: [{ csrfToken: 'secret', secretReferenceId: project, name: 'Provider' }], password: 'secret' };
  const output = safeDisplay(input);
  assert.equal(output.rows[0].csrfToken, '[redacted]');
  assert.equal(output.rows[0].secretReferenceId, '[redacted]');
  assert.equal(output.rows[0].name, 'Provider');
  assert.equal(input.password, 'secret');
  assert.ok(!JSON.stringify(output).includes('secret"'));
});
