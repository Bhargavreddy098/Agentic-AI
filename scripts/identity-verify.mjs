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

// Explicit local acceptance check: creates and revokes one temporary owner session.
let container, running, challengePath, token, csrfToken;
let stage = 'configuration';
const logoutKey = 'identity-qualification-' + randomUUID();
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
    stage = 'native launcher';
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
    stage = 'protected routes';
    for (const route of ['/session', '/workspaces', '/capabilities']) {
        assert.equal((await fetch(base + '/api/v1' + route, { headers: { cookie, origin } })).status, 200);
        assert.equal((await fetch(base + '/api/v1' + route, { method: 'HEAD', headers: { origin } })).status, 401);
    }
    stage = 'revocation';
    assert.equal((await fetch(base + '/api/v1/session', { method: 'DELETE', headers: { cookie, origin, 'x-csrf-token': csrfToken, 'idempotency-key': logoutKey } })).status, 204);
    assert.equal((await fetch(base + '/api/v1/session', { headers: { cookie, origin } })).status, 401);
    process.stdout.write('LOCAL_IDENTITY_VERIFIED: readiness, native launcher, bootstrap, protected routes, HEAD denial, and revocation passed.\n');
} catch {
    process.stderr.write(`LOCAL_IDENTITY_VERIFICATION_FAILED at ${stage}; no credentials are printed.\n`);
    process.exitCode = 1;
} finally {
    try {
        if (token && csrfToken && container) await container.services.identity.revoke(token, csrfToken, logoutKey);
        if (challengePath) await unlink(challengePath);
    } catch {
        process.stderr.write('IDENTITY_QUALIFICATION_CLEANUP_FAILED: check temporary session/challenge state locally.\n');
        process.exitCode = 1;
    } finally {
        if (running) await running.close();
        else if (container) await container.database.close();
    }
}
