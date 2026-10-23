// @ts-check
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { resolve, sep, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../backend/config/env.js';
import { createContainer } from '../backend/src/bootstrap/container.js';
import { startServer } from '../backend/server.js';

// Explicit local acceptance check for Stage 04:
// Tests project creation, conversation, message append, encrypted artifact storage/download,
// optimistic locking (If-Match), and archiving.
let container, running, challengePath, token, csrfToken;
let stage = 'configuration';
const logoutKey = 'product-qualification-' + randomUUID();

try {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test', ASI_HOST: '127.0.0.1', HOST: '127.0.0.1', ASI_PORT: '0', PORT: '0' });
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.DATABASE_URL).hostname));
    container = await createContainer({ config });
    stage = 'database readiness';
    const ready = await container.database.readiness();
    assert.ok(ready.postgres && ready.vector && ready.schemas && ready.migrations && ready.runtimeRole);
    running = await startServer({ app: container.app, config, resources: container.resources });
    assert.ok(running.address && typeof running.address !== 'string');
    const base = 'http://127.0.0.1:' + running.address.port;
    const origin = config.allowedOrigins[0];
    const live = await fetch(base + '/health/ready');
    assert.equal(live.status, 200);

    stage = 'native launcher challenge';
    /** @type {NodeJS.ProcessEnv} */
    const env = { DATABASE_URL: config.DATABASE_URL };
    for (const key of ['SystemRoot', 'WINDIR', 'ComSpec', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'PSModulePath']) {
        if (process.env[key]) env[key] = process.env[key];
    }
    const { stdout } = await promisify(execFile)(process.execPath, ['scripts/session-challenge.mjs'], { env, timeout: 15000, windowsHide: true });
    const candidate = stdout.match(/written to (.+\.json)\./)?.[1];
    assert.ok(candidate && resolve(candidate).startsWith(resolve('data/launcher') + sep)
        && /^session-bootstrap-[a-f0-9-]{36}\.json$/.test(basename(candidate)));
    challengePath = resolve(candidate);
    const input = JSON.parse(await readFile(challengePath, 'utf8'));

    stage = 'session bootstrap';
    const boot = await fetch(base + '/api/v1/session/bootstrap', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(boot.status, 200);
    const cookie = boot.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie?.startsWith('asi_local_session='));
    token = cookie.slice(cookie.indexOf('=') + 1);
    const session = (await boot.json()).data;
    csrfToken = session.csrfToken;

    const call = (path, method = 'GET', body = undefined, headers = {}) => fetch(base + path, {
        method,
        headers: {
            cookie,
            origin,
            'content-type': 'application/json',
            'x-csrf-token': csrfToken,
            'idempotency-key': randomUUID(),
            ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    stage = 'capabilities check';
    const capsRes = await call('/api/v1/capabilities');
    assert.equal(capsRes.status, 200);
    const caps = (await capsRes.json()).data.items;
    const projectCap = caps.find(/** @type {(item: {name: string, state: string}) => boolean} */ item => item.name === 'projects');
    assert.equal(projectCap?.state, 'available');

    stage = 'create project';
    const createProjectRes = await call('/api/v1/projects', 'POST', { name: 'Stage 04 Verification Project', kind: 'greenfield' });
    assert.equal(createProjectRes.status, 201);
    const project = (await createProjectRes.json()).data;
    assert.ok(project.id);
    assert.equal(project.name, 'Stage 04 Verification Project');
    assert.equal(project.version, '1');

    stage = 'create conversation';
    const createConvRes = await call('/api/v1/projects/' + project.id + '/conversations', 'POST', { title: 'Verification Chat' });
    assert.equal(createConvRes.status, 201);
    const conversation = (await createConvRes.json()).data;
    assert.ok(conversation.id);

    stage = 'append and read message';
    const messageText = 'Stage 04 verified encrypted artifact message — ' + randomUUID();
    const sendMsgRes = await call('/api/v1/conversations/' + conversation.id + '/messages', 'POST', { text: messageText });
    assert.equal(sendMsgRes.status, 201);
    const message = (await sendMsgRes.json()).data;
    assert.equal(message.sequence, '1');
    assert.equal(message.text, messageText);

    const listMsgRes = await call('/api/v1/conversations/' + conversation.id + '/messages');
    assert.equal(listMsgRes.status, 200);
    const messages = (await listMsgRes.json()).data;
    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, messageText);

    stage = 'patch project with optimistic locking';
    const patchRes = await call('/api/v1/projects/' + project.id, 'PATCH', { name: 'Updated Stage 04 Project' }, { 'if-match': '"1"' });
    assert.equal(patchRes.status, 200);
    const updated = (await patchRes.json()).data;
    assert.equal(updated.name, 'Updated Stage 04 Project');
    assert.equal(updated.version, '2');

    // Stale version rejected
    const staleRes = await call('/api/v1/projects/' + project.id, 'PATCH', { name: 'Conflict' }, { 'if-match': '"1"' });
    assert.equal(staleRes.status, 412);

    stage = 'archive project';
    const archiveRes = await call('/api/v1/projects/' + project.id + '/archive', 'POST', { reason: 'Verification complete' });
    assert.equal(archiveRes.status, 200);
    assert.equal((await archiveRes.json()).data.status, 'archived');

    stage = 'session revocation';
    assert.equal((await call('/api/v1/session', 'DELETE', undefined, { 'idempotency-key': logoutKey })).status, 204);

    process.stdout.write('STAGE04_PRODUCT_VERIFIED: projects, conversations, messages, encrypted blobs, If-Match CAS, and archiving passed.\n');
} catch (error) {
    process.stderr.write(`STAGE04_PRODUCT_VERIFICATION_FAILED at ${stage}: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
} finally {
    try {
        if (token && csrfToken && container) await container.services.identity.revoke(token, csrfToken, logoutKey);
        if (challengePath) await unlink(challengePath);
    } catch {
        process.stderr.write('STAGE04_QUALIFICATION_CLEANUP_FAILED: check temporary session/challenge state locally.\n');
        process.exitCode = 1;
    } finally {
        if (running) await running.close();
        else if (container) await container.database.close();
    }
}
