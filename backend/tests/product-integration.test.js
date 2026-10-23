// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { readFile, writeFile, rm, mkdtemp, symlink, rmdir, readdir } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createPostgresFixture } from './fixtures/postgres.js';
import { createIdentity } from '../src/modules/identity/index.js';
import { createProjects } from '../src/modules/projects/index.js';
import { createArtifacts } from '../src/modules/artifacts/index.js';
import { createConversations } from '../src/modules/conversations/index.js';
import { createArtifactStore } from '../src/platform/blob-store/index.js';
import { createUploads } from '../src/modules/artifacts/uploads.js';
import { createOperations } from '../src/modules/operations/index.js';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';

test('PostgreSQL product APIs preserve scope, concurrency, and encrypted message bytes', { timeout: 90000 }, async t => {
    const fixture = await createPostgresFixture({ poolMax: 4 });
    const scopes = [0, 1].map(() => ({ workspaceId: randomUUID(), principalId: randomUUID() }));
    let blobs;
    let server;
    try {
        blobs = await createArtifactStore();
        const identity = createIdentity({ pool: fixture.db.pool });
        const projects = createProjects({ pool: fixture.db.pool });
        const artifacts = createArtifacts({ pool: fixture.db.pool, projects, blobs });
        const conversations = createConversations({ pool: fixture.db.pool, projects, artifacts });
        const operations = createOperations({ pool: fixture.db.pool });
        const uploads = createUploads({ pool: fixture.db.pool, projects, artifacts, operations });
        const config = loadConfig({ DATABASE_URL: fixture.runtimeUrl.href });
        const origin = config.allowedOrigins[0];
        server = createApp({ config, services: { identity, projects, artifacts, conversations, uploads, operations } }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/v1`;
        const clients = [];
        for (const [index, scope] of scopes.entries()) {
            await fixture.owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Owner ' + index]);
            await fixture.owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)', [scope.workspaceId, scope.principalId, 'workspace-' + index, 'Workspace ' + index]);
            const input = await identity.issueChallenge(scope);
            const response = await fetch(base + '/session/bootstrap', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
            assert.equal(response.status, 200);
            const cookie = response.headers.get('set-cookie').split(';')[0];
            const session = (await response.json()).data;
            clients.push({ cookie, origin, 'x-csrf-token': session.csrfToken });
        }
        const call = (client, path, method = 'GET', body = undefined, headers = {}) => fetch(base + path, {
            method, headers: { ...clients[client], 'content-type': 'application/json', 'idempotency-key': randomUUID(), ...headers },
            ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
        });
        let project;
        let conversation;
        const text = 'Private message bytes — 世界 — ' + randomUUID();

        await t.test('strict input, native root references, and concurrent command replay', async () => {
            assert.equal((await call(0, '/projects', 'POST', { name: 'Forbidden', kind: 'greenfield', workspaceId: scopes[1].workspaceId })).status, 400);
            assert.equal((await call(0, '/projects', 'POST', { name: 'Host path', kind: 'existing', workspaceRootRef: 'C:/Users' })).status, 400);
            assert.equal((await call(0, '/projects', 'POST', { name: 'Unknown root', kind: 'existing', workspaceRootRef: randomUUID() })).status, 403);
            const body = { name: 'Durable project', kind: 'greenfield' };
            const responses = await Promise.all([call(0, '/projects', 'POST', body, { 'idempotency-key': 'create-project' }), call(0, '/projects', 'POST', body, { 'idempotency-key': 'create-project' })]);
            assert.deepEqual(responses.map(response => response.status), [201, 201]);
            const data = await Promise.all(responses.map(response => response.json()));
            assert.equal(data[0].data.id, data[1].data.id);
            project = data[0].data;
            assert.equal((await call(0, '/projects', 'POST', { ...body, name: 'Different body' }, { 'idempotency-key': 'create-project' })).status, 409);
            assert.equal((await call(1, '/projects/' + project.id)).status, 404);
            const listed = await (await call(0, '/projects?limit=1')).json();
            assert.equal(listed.data.length, 1);
            assert.equal((await call(0, '/projects?limit=1000')).status, 400);
        });

        await t.test('competing version updates cannot overwrite each other', async () => {
            assert.equal((await call(0, '/projects/' + project.id, 'PATCH', { name: 'Missing version' })).status, 428);
            const results = await Promise.all(['Left', 'Right'].map(name => call(0, '/projects/' + project.id, 'PATCH', { name }, { 'if-match': '"1"' })));
            assert.deepEqual(results.map(response => response.status).sort(), [200, 412]);
            assert.equal((await (await call(0, '/projects/' + project.id)).json()).data.version, '2');
        });

        await t.test('messages have monotonic sequences, exact replay, encrypted storage, and no plaintext replay payload', async () => {
            conversation = (await (await call(0, '/projects/' + project.id + '/conversations', 'POST', { title: 'Private conversation' })).json()).data;
            assert.ok(conversation.id);
            const path = '/conversations/' + conversation.id + '/messages';
            const results = await Promise.all([call(0, path, 'POST', { text }, { 'idempotency-key': 'message-1' }), call(0, path, 'POST', { text }, { 'idempotency-key': 'message-1' })]);
            assert.deepEqual(results.map(response => response.status), [201, 201]);
            const first = (await results[0].json()).data;
            assert.equal((await results[1].json()).data.id, first.id);
            assert.equal(first.sequence, '1');
            const parallel = await Promise.all(['Two', 'Three'].map(value => call(0, path, 'POST', { text: value })));
            assert.deepEqual(parallel.map(response => response.status), [201, 201]);
            const messages = await (await call(0, path)).json();
            assert.deepEqual(messages.data.map(message => message.sequence), ['1', '2', '3']);
            assert.equal(messages.data[0].text, text);
            const stored = await fixture.owner.query('SELECT a.* FROM product.artifacts a JOIN product.messages m ON m.content_ref=a.id WHERE m.id=$1', [first.id]);
            const encrypted = await readFile(resolve('data/artifacts', stored.rows[0].storage_key));
            assert.equal(encrypted.includes(Buffer.from(text)), false);
            const replay = await fixture.owner.query('SELECT response_body::text AS body FROM control.idempotency_records');
            assert.equal(replay.rows.some(row => row.body?.includes(text)), false);
            assert.equal((await call(1, path)).status, 404);
        });

        await t.test('messages remain readable after starting a separate explicitly enabled Stage 04 test process', async () => {
            const child = fork('backend/tests/fixtures/identity-server.js', ['--test-product-services'], { env: { ...process.env, DATABASE_URL: fixture.runtimeUrl.href }, silent: true });
            try {
                const [message] = await Promise.race([once(child, 'message', { signal: AbortSignal.timeout(15000) }), once(child, 'exit').then(() => { throw new Error('Product child exited early'); })]);
                const response = await fetch(`http://127.0.0.1:${message.port}/api/v1/conversations/${conversation.id}/messages`, { headers: clients[0] });
                assert.equal(response.status, 200);
                assert.equal((await response.json()).data[0].text, text);
            } finally {
                if (child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
            }
        });

        await t.test('artifact bytes are authenticated and downloads cannot render active content', async () => {
            const stored = (await fixture.owner.query('SELECT a.* FROM product.artifacts a JOIN product.messages m ON m.content_ref=a.id WHERE m.conversation_id=$1 ORDER BY m.sequence LIMIT 1', [conversation.id])).rows[0];
            const path = resolve('data/artifacts', stored.storage_key);
            const bytes = await readFile(path);
            const corrupted = Buffer.from(bytes);
            corrupted[corrupted.length - 1] ^= 1;
            try {
                await writeFile(path, corrupted);
                assert.equal((await call(0, '/conversations/' + conversation.id + '/messages')).status, 503);
            } finally { await writeFile(path, bytes); }
            const response = await call(0, '/artifacts/' + stored.id + '/content');
            assert.equal(response.status, 200);
            assert.ok(response.headers.get('content-disposition').startsWith('attachment;'));
            assert.equal(await response.text(), text);
            assert.equal((await call(0, '/artifacts/' + stored.id + '/content', 'GET', undefined, { range: 'bytes=0-2' })).status, 416);
        });

        await t.test('junctions in the private artifact scope are rejected before writing outside it', async () => {
            const target = await mkdtemp(join(tmpdir(), 'asi-artifact-boundary-'));
            const link = resolve('data/artifacts', randomUUID());
            try {
                await symlink(target, link, 'junction');
                await assert.rejects(blobs.write({ workspaceId: link.split(sep).at(-1), projectId: randomUUID() }, Buffer.from('escape')), /junction/);
                assert.deepEqual(await readdir(target), []);
            } finally { await rmdir(link); await rmdir(target); }
        });

        await t.test('staged uploads validate filenames, lengths, digests, replay, and project-scoped attachments', async () => {
            const { createHash } = await import('node:crypto');
            const bytes = Buffer.from('Uploaded UTF-8 text — 世界');
            const digest = createHash('sha256').update(bytes).digest('hex');
            const input = { filename: 'note.txt', mediaType: 'text/plain', bytes: String(bytes.length), digest };
            const beginPath = '/projects/' + project.id + '/uploads';
            for (const filename of ['../secret.txt', 'C:\\secret.txt', 'CON.txt', 'bad.txt.']) {
                assert.equal((await call(0, beginPath, 'POST', { ...input, filename })).status, 400);
            }
            const begin = await call(0, beginPath, 'POST', input);
            assert.equal(begin.status, 201);
            const upload = (await begin.json()).data;
            const path = '/uploads/' + upload.id;
            assert.equal((await call(0, path + '/complete', 'POST', { digest })).status, 409);
            assert.equal((await call(0, path + '/content', 'PUT', Buffer.from('wrong'), { 'content-type': 'application/octet-stream' })).status, 409);
            const written = await call(0, path + '/content', 'PUT', bytes, { 'content-type': 'application/octet-stream' });
            assert.equal(written.status, 200);
            assert.equal((await written.json()).data.receivedBytes, String(bytes.length));
            assert.equal((await call(0, path + '/content', 'PUT', bytes, { 'content-type': 'application/octet-stream' })).status, 200);
            const first = await call(0, path + '/complete', 'POST', { digest }, { 'idempotency-key': 'complete-upload' });
            assert.equal(first.status, 202);
            const operation = (await first.json()).data;
            assert.equal(operation.state, 'succeeded');
            const repeated = await call(0, path + '/complete', 'POST', { digest }, { 'idempotency-key': 'complete-upload' });
            assert.equal((await repeated.json()).data.id, operation.id);
            assert.equal((await call(1, '/operations/' + operation.id)).status, 404);
            const content = await call(0, '/artifacts/' + operation.resourceId + '/content');
            assert.equal(content.status, 200);
            assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
            const message = await call(0, '/conversations/' + conversation.id + '/messages', 'POST', { text: 'Attached', attachmentIds: [operation.resourceId] });
            assert.equal(message.status, 201);
            const otherProject = (await (await call(0, '/projects', 'POST', { name: 'Other project', kind: 'greenfield' })).json()).data;
            const otherConversation = (await (await call(0, '/projects/' + otherProject.id + '/conversations', 'POST', {})).json()).data;
            assert.equal((await call(0, '/conversations/' + otherConversation.id + '/messages', 'POST', { text: 'Wrong scope', attachmentIds: [operation.resourceId] })).status, 409);
        });

        await t.test('unqualified binary and invalid UTF-8 content stays quarantined', async () => {
            const { createHash } = await import('node:crypto');
            for (const mediaType of ['application/octet-stream', 'text/plain']) {
                const bytes = Buffer.from([255, 254, 0, 1]);
                const digest = createHash('sha256').update(bytes).digest('hex');
                const upload = (await (await call(0, '/projects/' + project.id + '/uploads', 'POST', { filename: 'candidate.bin', mediaType, bytes: '4', digest })).json()).data;
                assert.equal((await call(0, '/uploads/' + upload.id + '/content', 'PUT', bytes, { 'content-type': 'application/octet-stream' })).status, 200);
                const operation = (await (await call(0, '/uploads/' + upload.id + '/complete', 'POST', { digest })).json()).data;
                assert.equal(operation.state, 'blocked');
                assert.equal(operation.safeError.code, 'QUARANTINED');
                const stored = (await fixture.owner.query('SELECT artifact_id FROM product.uploads WHERE id=$1', [upload.id])).rows[0];
                assert.equal((await call(0, '/artifacts/' + stored.artifact_id + '/content')).status, 409);
            }
        });

        await t.test('archiving blocks new writes while retaining existing content', async () => {
            assert.equal((await call(0, '/projects/' + project.id + '/archive', 'POST', { reason: 'Completed test' })).status, 200);
            assert.equal((await call(0, '/conversations/' + conversation.id + '/messages', 'POST', { text: 'Forbidden' })).status, 409);
            assert.equal((await call(0, '/conversations/' + conversation.id + '/messages')).status, 200);
        });
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
        await blobs?.close();
        await fixture.close();
        for (const scope of scopes) {
            const target = resolve('data/artifacts', scope.workspaceId);
            assert.ok(target.startsWith(resolve('data/artifacts') + sep));
            // These UUID directories belong exclusively to this disposable fixture.
            await rm(target, { recursive: true, force: true });
        }
    }
});
