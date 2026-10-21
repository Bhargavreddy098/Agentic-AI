import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
async function serve(options, work) {
    const server = createServer(createApp(options));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
        await work(base);
    }
    finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}
const config = loadConfig({ DATABASE_URL: 'postgres://test:test@127.0.0.1/test' });
test('liveness remains healthy while database readiness fails', async () => {
    await serve({ config, readiness: async () => ({ postgres: false, vector: false }) }, async (base) => {
        assert.equal((await fetch(base + '/health')).status, 200);
        assert.equal((await fetch(base + '/health/ready')).status, 503);
    });
});
test('invalid configuration rejects without echoing credentials', () => {
    assert.throws(() => loadConfig({ DATABASE_URL: 'invalid-secret-value', PORT: 'bad' }), error => !error.message.includes('invalid-secret-value'));
});
test('unknown routes return normalized errors with request identity', async () => {
    await serve({ config }, async (base) => {
        const response = await fetch(base + '/missing');
        assert.equal(response.status, 404);
        assert.ok(response.headers.get('x-request-id'));
        assert.equal((await response.json()).code, 'NOT_FOUND');
    });
});
test('unsupported product operations do not gain synthetic data', async () => {
    await serve({ config }, async (base) => {
        assert.equal((await fetch(base + '/api/ui/v1/conversations')).status, 401);
        const response = await fetch(base + '/api/ui/v1/auth/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ assertion: 'assert-workspace-a' }) });
        assert.equal(response.status, 401);
    });
});
