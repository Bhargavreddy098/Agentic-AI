// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { createIdentity } from '../src/modules/identity/index.js';
import { createPostgresFixture } from './fixtures/postgres.js';
import { createApp } from '../app.js';
import { loadConfig } from '../config/env.js';
import { promisify } from 'node:util';
import { execFile, fork } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Writable } from 'node:stream';
import { createLogger } from '../config/logger.js';
import { withScopedTransaction } from '../src/platform/database/transaction.js';
import { applyStage02Migrations } from '../src/platform/database/migrate.js';
import { createContainer } from '../src/bootstrap/container.js';

test('local identity survives restart and enforces the native launcher boundary', { timeout: 60000 }, async t => {
    const fixture = await createPostgresFixture({ stage03Only: true });
    const { db, owner, runtimeUrl } = fixture;
    let server;
    try {
        const scope = { workspaceId: randomUUID(), principalId: randomUUID() };
        await owner.query('INSERT INTO identity.principals (principal_id,kind,display_name) VALUES ($1,$2,$3)', [scope.principalId, 'local_user', 'Local Owner']);
        await owner.query('INSERT INTO identity.workspaces (workspace_id,owner_principal_id,slug,display_name) VALUES ($1,$2,$3,$4)', [scope.workspaceId, scope.principalId, 'local-main', 'Local Workspace']);
        const identity = createIdentity({ pool: db.pool });
        const openapi = JSON.parse(await readFile(new URL('../../docs/backend/api/stage03.openapi.json', import.meta.url), 'utf8'));
        assert.equal(openapi.openapi, '3.1.0');
        const validateRefs = value => {
            if (!value || typeof value !== 'object') return;
            if (value.$ref) assert.ok(value.$ref.startsWith('#/') && value.$ref.slice(2).split('/').reduce((node, key) => node?.[key], openapi));
            for (const child of Object.values(value)) validateRefs(child);
        };
        validateRefs(openapi);
        const logs = [];
        const secrets = [];
        const logger = createLogger({}, new Writable({ write(chunk, _encoding, done) { logs.push(chunk.toString()); done(); } }));
        const config = loadConfig({ DATABASE_URL: runtimeUrl.href });
        const origin = config.allowedOrigins[0];
        server = createApp({ config, services: { identity }, logger }).listen(0, '127.0.0.1');
        await once(server, 'listening');
        const base = `http://127.0.0.1:${server.address().port}/api/v1`;
        const bootstrap = input => fetch(base + '/session/bootstrap', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
        let session;
        let token;
        let cookie;

        await t.test('Stage 03 migrates cleanly, replays without changes, and excludes Stage 04 tables', async () => {
            await assert.rejects(createContainer({ config: loadConfig({ DATABASE_URL: runtimeUrl.href, NODE_ENV: 'production' }), includeUnqualifiedProductServices: true }), /restricted to test/);
            await assert.rejects(createContainer({ config: loadConfig({ DATABASE_URL: fixture.ownerUrl.href }) }), /safe runtime role/);
            assert.equal(fixture.migrationResult.applied.length, 6);
            assert.equal((await owner.query("SELECT to_regclass('product.artifacts') AS name")).rows[0].name, null);
            await owner.query(`SET ROLE "${fixture.migrator}"`);
            try { assert.deepEqual((await applyStage02Migrations(owner, { stage03Only: true })).applied, []); }
            finally { await owner.query('RESET ROLE'); }
            assert.equal((await db.readiness()).migrations, true);
        });

        await t.test('Windows launcher writes an ACL-protected challenge without logging its bytes', async () => {
            const { stdout } = await promisify(execFile)(process.execPath, ['scripts/session-challenge.mjs'], { env: { ...process.env, DATABASE_URL: runtimeUrl.href }, timeout: 15000 });
            const path = stdout.match(/written to (.+\.json)\./)?.[1];
            assert.ok(path);
            assert.ok(resolve(path).startsWith(resolve('data/launcher') + '\\'));
            let challenge;
            try {
                challenge = JSON.parse(await readFile(path, 'utf8'));
                secrets.push(challenge.challenge, challenge.clientNonce);
                assert.equal(stdout.includes(challenge.challenge), false);
                const launcherDirectory = resolve('data/launcher').replaceAll("'", "''");
                const acl = await promisify(execFile)('powershell.exe', ['-NoProfile', '-Command', `[IO.Directory]::GetAccessControl('${launcherDirectory}').AreAccessRulesProtected`]);
                assert.equal(acl.stdout.trim(), 'True');
            } finally { await unlink(path); }
            const response = await bootstrap(challenge);
            assert.equal(response.status, 200);
            assert.ok(response.headers.get('set-cookie').includes('HttpOnly'));
            assert.match(response.headers.get('set-cookie'), /SameSite=Strict/);
            assert.match(response.headers.get('set-cookie'), /Path=\/api\/v1/);
            cookie = response.headers.get('set-cookie').split(';')[0];
            token = cookie.slice(cookie.indexOf('=') + 1);
            session = (await response.json()).data;
            assert.deepEqual(Object.keys(session).sort(), [...openapi.components.schemas.Session.required].sort());
            secrets.push(token, session.csrfToken);
            assert.equal(session.principalId, scope.principalId);
            assert.equal(session.workspaceId, scope.workspaceId);
            assert.equal((await bootstrap(challenge)).status, 409);
        });

        await t.test('strict bootstrap and credentialed browser preflight enforce the exact Origin allowlist', async () => {
            const input = await identity.issueChallenge(scope);
            assert.equal((await bootstrap({ ...input, principalId: scope.principalId })).status, 400);
            const preflightHeaders = { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' };
            const preflight = await fetch(base + '/session/bootstrap', { method: 'OPTIONS', headers: preflightHeaders });
            assert.equal(preflight.status, 204);
            assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
            assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
            assert.equal((await fetch(base + '/session/bootstrap', { method: 'OPTIONS', headers: { ...preflightHeaders, origin: 'https://attacker.invalid' } })).status, 403);
            assert.equal((await fetch(base + '/session/bootstrap', { method: 'OPTIONS', headers: { ...preflightHeaders, 'access-control-request-headers': 'x-principal-id' } })).status, 403);
            assert.equal((await bootstrap(input)).status, 200, 'rejected unknown fields must not consume the launcher challenge');
        });

        await t.test('GET and HEAD route variants all require authenticated owner sessions', async () => {
            for (const method of ['GET', 'HEAD']) {
                for (const path of ['/session', '/workspaces', '/capabilities', '/WORKSPACES', '/capabilities/']) {
                    const unauthenticated = await fetch(base + path, { method, headers: { origin } });
                    assert.equal(unauthenticated.status, 401, method + ' ' + path);
                    assert.equal((await fetch(base + path, { method, headers: { cookie, origin } })).status, 200);
                }
            }
            for (const path of ['/projects', '/settings', '/operations/' + randomUUID()]) {
                assert.equal((await fetch(base + path, { headers: { origin } })).status, 401);
            }
            assert.equal((await fetch(base + '/session', { method: 'DELETE', headers: { cookie, 'x-csrf-token': session.csrfToken, 'idempotency-key': 'missing-origin' } })).status, 403);
            assert.equal((await fetch(base + '/session', { method: 'DELETE', headers: { cookie, origin, 'idempotency-key': 'missing-csrf' } })).status, 403);
        });

        await t.test('raw tokens are not stored and reconstructing the identity port preserves sessions', async () => {
            assert.ok(session);
            const stored = await owner.query('SELECT encode(token_hash,$1) AS token_hash,encode(csrf_hash,$1) AS csrf_hash FROM identity.sessions WHERE token_hash=$2', ['hex', createHash('sha256').update(token).digest()]);
            assert.equal(stored.rows.length, 1);
            assert.equal(stored.rows[0].token_hash.length, 64);
            assert.notEqual(stored.rows[0].token_hash, token);
            assert.notEqual(stored.rows[0].csrf_hash, session.csrfToken);
            const restarted = createIdentity({ pool: db.pool });
            assert.equal((await restarted.authenticate(token)).principalId, scope.principalId);
            assert.deepEqual(await restarted.current(token), session);
            const response = await fetch(base + '/session', { headers: { cookie, origin } });
            assert.equal(response.status, 200);
            assert.deepEqual((await response.json()).data, session);
        });

        await t.test('Host, Origin, CSRF, forged cookies, and forwarded identity headers are rejected', async () => {
            const hostileHostStatus = await new Promise((done, fail) => {
                const req = request(base + '/session', { headers: { cookie, host: 'attacker.invalid' } }, res => { res.resume(); done(res.statusCode); });
                req.on('error', fail);
                req.end();
            });
            assert.equal(hostileHostStatus, 403);
            assert.equal((await fetch(base + '/session', { headers: { cookie, origin: 'https://attacker.invalid' } })).status, 403);
            assert.equal((await fetch(base + '/session', { headers: { 'x-principal-id': scope.principalId } })).status, 401);
            assert.equal((await fetch(base + '/session', { headers: { cookie: 'asi_local_session=forged' } })).status, 401);
            assert.equal((await fetch(base + '/session', { method: 'DELETE', headers: { cookie, origin, 'x-csrf-token': 'bad' } })).status, 403);
            assert.equal((await fetch(base + '/session/bootstrap', { method: 'POST', headers: { origin: 'https://attacker.invalid', 'content-type': 'application/json' }, body: '{}' })).status, 403);
        });

        await t.test('a cookie remains valid after killing and restarting the actual HTTP process', async () => {
            for (let attempt = 0; attempt < 2; attempt++) {
                const child = fork('backend/tests/fixtures/identity-server.js', ['--stage03'], {
                    env: { ...process.env, DATABASE_URL: runtimeUrl.href }, silent: true,
                });
                try {
                    const [message] = await Promise.race([
                        once(child, 'message', { signal: AbortSignal.timeout(10000) }),
                        once(child, 'exit').then(() => { throw new Error('Identity child exited before listening'); }),
                    ]);
                    const response = await fetch(`http://127.0.0.1:${message.port}/api/v1/session`, { headers: { cookie, origin } });
                    assert.equal((await fetch(`http://127.0.0.1:${message.port}/health/ready`)).status, 200, 'Stage 03 startup must not require Stage 04 tables');
                    assert.equal(response.status, 200);
                    assert.equal((await response.json()).data.principalId, scope.principalId);
                } finally {
                    if (child.exitCode === null && child.signalCode === null) {
                        const exited = once(child, 'exit');
                        child.kill('SIGKILL');
                        await exited;
                    }
                }
            }
        });

        await t.test('identity metadata enforces workspace scope, typed worker identity, and capability-hash RLS', async () => {
            assert.equal((await db.pool.query('SELECT * FROM identity.sessions')).rowCount, 0);
            assert.equal((await db.pool.query('SELECT * FROM identity.bootstrap_challenges')).rowCount, 0);
            const second = { workspaceId: randomUUID(), principalId: randomUUID() };
            await owner.query('INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,$2,$3)', [second.principalId, 'local_user', 'Other Owner']);
            await owner.query('INSERT INTO identity.workspaces(workspace_id,owner_principal_id,slug,display_name) VALUES($1,$2,$3,$4)', [second.workspaceId, second.principalId, 'other-owner', 'Other Workspace']);
            const ref = randomUUID();
            await withScopedTransaction(db.pool, scope, tx => tx.query(`INSERT INTO identity.secret_references
                (id,workspace_id,owner_principal_id,store,opaque_ref,purpose,credential_version) VALUES($1,$2,$3,'windows_dpapi',$4,'test-reference',1)`,
            [ref, scope.workspaceId, scope.principalId, 'opaque-' + randomUUID()]));
            assert.equal((await withScopedTransaction(db.pool, second, tx => tx.query('SELECT id FROM identity.secret_references WHERE id=$1', [ref]))).rowCount, 0);
            await assert.rejects(withScopedTransaction(db.pool, second, tx => tx.query(`INSERT INTO identity.secret_references
                (id,workspace_id,owner_principal_id,store,opaque_ref,purpose,credential_version) VALUES($1,$2,$3,'windows_dpapi',$4,'test-reference',1)`,
            [randomUUID(), second.workspaceId, scope.principalId, 'opaque-' + randomUUID()])), error => error.code === '23503');
            await assert.rejects(withScopedTransaction(db.pool, scope, tx => tx.query(`INSERT INTO identity.worker_connections
                (id,workspace_id,worker_principal_id,public_key,capabilities) VALUES($1,$2,$3,$4,'[]')`,
            [randomUUID(), scope.workspaceId, scope.principalId, Buffer.alloc(32)])), error => error.code === '23503');
            const workerId = randomUUID(), connectionId = randomUUID();
            await owner.query('INSERT INTO identity.principals(principal_id,kind,display_name) VALUES($1,$2,$3)', [workerId, 'worker', 'Scoped Worker']);
            await withScopedTransaction(db.pool, scope, tx => tx.query(`INSERT INTO identity.worker_connections
                (id,workspace_id,worker_principal_id,public_key,capabilities) VALUES($1,$2,$3,$4,'[]')`,
            [connectionId, scope.workspaceId, workerId, Buffer.alloc(32)]));
            assert.equal((await withScopedTransaction(db.pool, second, tx => tx.query('SELECT id FROM identity.worker_connections WHERE id=$1', [connectionId]))).rowCount, 0);
            const response = await fetch(base + '/workspaces?limit=1', { headers: { cookie, origin } });
            assert.deepEqual((await response.json()).data.map(row => row.id), [scope.workspaceId]);
            for (const query of ['?limit=101', '?cursor=invalid', '?cursor=', '?principalId=' + second.principalId]) {
                assert.equal((await fetch(base + '/workspaces' + query, { headers: { cookie, origin } })).status, 400);
            }
        });

        await t.test('session expiry, challenge concurrency, and token rotation fail closed', async () => {
            const input = await identity.issueChallenge(scope);
            const results = await Promise.all([bootstrap(input), bootstrap(input)]);
            assert.deepEqual(results.map(response => response.status).sort(), [200, 409]);
            const successful = results.find(response => response.status === 200);
            const rotatedCookie = successful.headers.get('set-cookie').split(';')[0];
            const rotatedToken = rotatedCookie.slice(rotatedCookie.indexOf('=') + 1);
            const nextInput = await identity.issueChallenge(scope);
            const next = await identity.bootstrap({ ...nextInput, previousToken: rotatedToken });
            await assert.rejects(identity.authenticate(rotatedToken), error => error.code === 'SESSION_EXPIRED');
            assert.equal((await identity.authenticate(next.token)).principalId, scope.principalId);
            await owner.query('UPDATE identity.sessions SET idle_expires_at=clock_timestamp()-interval \'1 second\' WHERE token_hash=$1', [createHash('sha256').update(next.token).digest()]);
            await assert.rejects(identity.authenticate(next.token), error => error.code === 'SESSION_EXPIRED');
        });

        await t.test('session revocation is durable and repeated logout is idempotent', async () => {
            const headers = { cookie, origin, 'x-csrf-token': session.csrfToken, 'idempotency-key': 'logout-integration' };
            assert.equal((await fetch(base + '/session', { method: 'DELETE', headers })).status, 204);
            assert.equal((await fetch(base + '/session', { method: 'DELETE', headers })).status, 204);
            await assert.rejects(createIdentity({ pool: db.pool }).authenticate(token), error => error.code === 'SESSION_EXPIRED');
        });

        await t.test('absolute session expiry and conflicting logout replay cannot authorize another session', async () => {
            const active = await identity.bootstrap(await identity.issueChallenge(scope));
            await assert.rejects(identity.revoke(active.token, active.data.csrfToken, 'logout-integration'), error => error.code === 'IDEMPOTENCY_CONFLICT');
            assert.equal((await identity.authenticate(active.token)).principalId, scope.principalId);
            const expiredAt = new Date(Date.now() - 1000);
            await owner.query("UPDATE identity.sessions SET created_at=$2::timestamptz-interval '1 second',expires_at=$2,idle_expires_at=$2 WHERE token_hash=$1", [createHash('sha256').update(active.token).digest(), expiredAt]);
            await assert.rejects(identity.authenticate(active.token), error => error.code === 'SESSION_EXPIRED');
        });

        await t.test('expired challenges, nonce mismatch, disabled owners, and worker impersonation cannot bootstrap', async () => {
            const expired = await identity.issueChallenge(scope);
            await owner.query(`UPDATE identity.bootstrap_challenges SET expires_at=created_at + interval '1 millisecond'`);
            assert.equal((await bootstrap(expired)).status, 401);
            const fresh = await identity.issueChallenge(scope);
            assert.equal((await bootstrap({ ...fresh, clientNonce: 'a'.repeat(43) })).status, 401);
            const active = await identity.bootstrap(await identity.issueChallenge(scope));
            await owner.query('UPDATE identity.principals SET kind=$1 WHERE principal_id=$2', ['worker', scope.principalId]);
            assert.equal((await bootstrap(fresh)).status, 401);
            await assert.rejects(identity.authenticate(active.token), error => error.code === 'SESSION_EXPIRED');
            await owner.query('UPDATE identity.principals SET kind=$1,status=$2 WHERE principal_id=$3', ['local_user', 'revoked', scope.principalId]);
            assert.equal((await bootstrap(fresh)).status, 401);
            await assert.rejects(identity.current(active.token), error => error.code === 'SESSION_EXPIRED');
        });

        await t.test('HTTP logging and safe errors contain no raw session or launcher secrets', async () => {
            const output = logs.join('');
            assert.ok(output.includes('/api/v1/session'));
            for (const secret of secrets) assert.equal(output.includes(secret), false);
            const error = await fetch(base + '/session', { headers: { cookie: 'asi_local_session=forged', origin } });
            assert.match(error.headers.get('content-type'), /application\/problem\+json/);
            const problem = await error.json();
            assert.equal(problem.status, 401);
            assert.deepEqual(Object.keys(problem).sort(), ['code', 'detail', 'requestId', 'retryable', 'status', 'title', 'type']);
            assert.ok(problem.requestId);
            assert.equal(JSON.stringify(problem).includes(runtimeUrl.password), false);
        });
    } finally {
        if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
        await fixture.close();
    }
});
