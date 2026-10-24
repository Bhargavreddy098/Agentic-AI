// @ts-check
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
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;
    try {
        await work(base);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
}

const config = loadConfig({ DATABASE_URL: 'postgres://test:test@127.0.0.1/test' });

test('public rate limiting returns the canonical correlated retryable problem', async () => {
    await serve({ config }, async base => {
        for (let i = 0; i < 300; i++) {
            const response = await fetch(base + '/api/v1/health/live');
            assert.equal(response.status, 200);
            await response.arrayBuffer();
        }
        const response = await fetch(base + '/api/v1/health/live');
        assert.equal(response.status, 429);
        assert.match(response.headers.get('content-type'), /application\/problem\+json/);
        const problem = await response.json();
        assert.equal(problem.code, 'RATE_LIMITED');
        assert.equal(problem.retryable, true);
        assert.equal(problem.requestId, response.headers.get('x-request-id'));
        assert.equal('safeMessage' in problem, false);
    });
});

test('liveness remains healthy while database readiness fails across /health and /api/v1/health', async () => {
    await serve({ config, readiness: async () => ({ postgres: false, vector: false }) }, async (base) => {
        assert.equal((await fetch(base + '/health')).status, 200);
        assert.equal((await fetch(base + '/health/live')).status, 200);
        assert.equal((await fetch(base + '/api/v1/health/live')).status, 200);
        assert.equal((await fetch(base + '/health/ready')).status, 503);
        assert.equal((await fetch(base + '/api/v1/health/ready')).status, 503);
    });
});

test('readiness requires verified migrations, schemas, and a least-privilege runtime role', async () => {
    await serve({ config, readiness: async () => ({ postgres: true, vector: true, schemas: true, migrations: true, runtimeRole: true }) }, async (base) => {
        const res = await fetch(base + '/health/ready');
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.deepEqual(body, { ready: true });
        assert.deepEqual(await (await fetch(base + '/health/live')).json(), { status: 'live' });
        const alias = await (await fetch(base + '/api/v1/health/ready')).json();
        assert.equal(alias.status, 'ready');
        assert.equal(alias.vector, true);
    });
});

test('reachable PostgreSQL and vector alone cannot claim readiness', async () => {
    for (const missing of ['schemas', 'migrations', 'runtimeRole']) {
        await serve({ config, readiness: async () => ({ postgres: true, vector: true, schemas: true, migrations: true, runtimeRole: true, [missing]: false }) }, async base => {
            assert.equal((await fetch(base + '/health/ready')).status, 503);
        });
    }
});

test('invalid configuration rejects without echoing credentials and reconciles ASI_HOST/HOST', () => {
    assert.throws(
        () => loadConfig({ DATABASE_URL: 'invalid-secret-value', PORT: 'bad' }),
        error => !error.message.includes('invalid-secret-value')
    );
    assert.throws(
        () => loadConfig({ DATABASE_URL: 'postgres://test@127.0.0.1/test', ASI_HOST: '127.0.0.1', HOST: '::1' }),
        /conflicting ASI_HOST and HOST/
    );
    assert.throws(
        () => loadConfig({ DATABASE_URL: 'postgres://test@127.0.0.1/test', ASI_HOST: '0.0.0.0' }),
        /non-loopback ASI_HOST/
    );
    const resolved = loadConfig({ DATABASE_URL: 'postgres://test@127.0.0.1/test', ASI_HOST: '127.0.0.1', ASI_PORT: '3100' });
    assert.equal(resolved.ASI_HOST, '127.0.0.1');
    assert.equal(resolved.HOST, '127.0.0.1');
    assert.equal(resolved.ASI_PORT, 3100);
    assert.equal(resolved.PORT, 3100);
});

test('unknown routes return application/problem+json normalized errors with request identity', async () => {
    await serve({ config }, async (base) => {
        const response = await fetch(base + '/missing');
        assert.equal(response.status, 404);
        assert.ok(response.headers.get('x-request-id'));
        assert.ok((response.headers.get('content-type') ?? '').includes('application/problem+json'));
        const body = await response.json();
        assert.equal(body.code, 'NOT_FOUND');
        assert.equal(body.status, 404);
        assert.equal(body.requestId, response.headers.get('x-request-id'));
    });
});

test('unsupported product operations do not gain synthetic data', async () => {
    await serve({ config }, async (base) => {
        assert.equal((await fetch(base + '/api/ui/v1/conversations')).status, 401);
        const response = await fetch(base + '/api/ui/v1/auth/session', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ assertion: 'assert-workspace-a' }),
        });
        assert.equal(response.status, 401);
    });
});

