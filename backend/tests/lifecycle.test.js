import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server.js';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { Writable } from 'node:stream';
test('server binds on demand and releases owned resources once on repeated shutdown', async () => {
    const config = { ...loadConfig({ DATABASE_URL: 'postgres://test@127.0.0.1/test' }), PORT: 0 };
    let closed = 0;
    const running = await startServer({ app: createApp({ config }), config, resources: [{ close: async () => { closed++; } }] });
    const response = await fetch(`http://127.0.0.1:${running.address.port}/health`);
    assert.equal(response.status, 200);
    await response.body.cancel();
    await Promise.all([running.close(), running.close()]);
    assert.equal(closed, 1);
    assert.equal(running.server.listening, false);
});
test('structured logs redact credentials and request bodies', () => {
    let output = '';
    const destination = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
    const logger = createLogger({}, destination);
    logger.info({ password: 'private-password', DATABASE_URL: 'private-database', req: { headers: { authorization: 'private-token', cookie: 'private-cookie' }, body: 'private-body' } }, 'test');
    for (const secret of ['private-password', 'private-database', 'private-token', 'private-cookie', 'private-body'])
        assert.equal(output.includes(secret), false);
    assert.ok(output.includes('[REDACTED]'));
});
