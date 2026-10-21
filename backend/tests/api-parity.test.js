import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createMemoryUiPorts } from '../workers/gateway/dist/ui/memory-ports.js';
const origin = 'http://127.0.0.1:3200';
async function scenario(work) {
    const ports = createMemoryUiPorts();
    const server = createServer(createApp({ config: loadConfig({ DATABASE_URL: 'postgres://test:test@127.0.0.1/test' }), services: ports }));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/ui/v1`;
    const login = await fetch(base + '/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assertion: 'assert-workspace-a' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0], { csrfToken } = await login.json();
    const headers = { 'content-type': 'application/json', cookie, origin, 'x-csrf-token': csrfToken };
    const call = (path, method = 'GET', body, override = {}) => fetch(base + path, { method, headers: { ...headers, ...override }, ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
    try {
        await work(call);
    }
    finally {
        server.closeAllConnections();
        await new Promise(done => server.close(done));
    }
}
test('Express preserves conversation idempotency and snapshot contract using injected test ports', () => scenario(async (call) => {
    const first = await (await call('/conversations', 'POST', { commandId: 'create-1' })).json();
    const duplicate = await (await call('/conversations', 'POST', { commandId: 'create-1' })).json();
    assert.equal(first.conversationId, duplicate.conversationId);
    const snapshot = await (await call(`/conversations/${first.conversationId}/snapshot`)).json();
    assert.deepEqual(snapshot.messages, []);
    const caps = await (await call('/capabilities')).json();
    assert.equal(caps.operations.filter(op => op.state === 'live').length, 0);
}));
test('origin/CSRF violations reject and unknown assertions cannot bootstrap', () => scenario(async (call) => {
    assert.equal((await call('/conversations', 'POST', { commandId: 'create-2' }, { origin: 'http://evil.invalid' })).status, 403);
    assert.equal((await call('/conversations', 'POST', { commandId: 'create-2' }, { 'x-csrf-token': 'wrong' })).status, 403);
    assert.equal((await call('/auth/session', 'POST', { assertion: 'forged' })).status, 401);
}));
test('raw uploads retain bytes and complete through the existing quarantine owner', () => scenario(async (call) => {
    const upload = await (await call('/uploads', 'POST', { commandId: 'upload-1', fileName: 'note.txt', mimeType: 'text/plain', byteSize: 3 })).json();
    assert.ok(upload.uploadId);
    assert.equal((await call(`/uploads/${upload.uploadId}/content`, 'PUT', Buffer.from('abc'))).status, 204);
    const ready = await (await call(`/uploads/${upload.uploadId}/complete`, 'POST', { commandId: 'complete-1' })).json();
    assert.equal(ready.status, 'ready');
}));
test('SSE replay uses canonical event envelopes and rejects malformed cursors', () => scenario(async (call) => {
    const conversation = await (await call('/conversations', 'POST', { commandId: 'events-create' })).json();
    const response = await call(`/conversations/${conversation.conversationId}/events?after=0`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').includes('text/event-stream'));
    await response.text();
    assert.equal((await call(`/conversations/${conversation.conversationId}/events?after=bogus`)).status, 400);
}));
