// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, readFile, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { createPostgresFixture } from '../fixtures/postgres.js';
import { applyStage02Migrations, loadStage02MigrationPlan } from '../../src/platform/database/migrate.js';
import { withScopedTransaction, withTransaction } from '../../src/platform/database/transaction.js';
import { createEncryptedDatabaseBackup, restoreEncryptedDatabaseBackup } from '../../src/platform/database/backup.js';
import { createPostgresPool } from '../../src/platform/database/pool.js';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config/env.js';

const run = promisify(execFile);

test('Stage 02 real PostgreSQL qualification in a disposable database', { timeout: 90000 }, async t => {
    const fixture = await createPostgresFixture({ stage02Only: true });
    const migrationOptions = { stage02Only: true };
    const plan = loadStage02MigrationPlan(migrationOptions);
    const { owner, db, admin, database, migrator, ownerUrl } = fixture;
    try {
        const a = { workspaceId: randomUUID(), principalId: randomUUID(), projectId: randomUUID() };
        const b = { workspaceId: randomUUID(), principalId: randomUUID(), projectId: randomUUID() };
        for (const [label, scope] of [['a', a], ['b', b]]) {
            await owner.query('INSERT INTO identity.principals (principal_id, kind, display_name) VALUES ($1, $2, $3)', [scope.principalId, 'owner', label]);
            await owner.query('INSERT INTO identity.workspaces (workspace_id, owner_principal_id, slug, display_name) VALUES ($1, $2, $3, $4)', [scope.workspaceId, scope.principalId, 'workspace-' + label, label]);
            await owner.query('INSERT INTO product.projects (project_id, workspace_id, slug, title) VALUES ($1, $2, $3, $4)', [scope.projectId, scope.workspaceId, 'project-' + label, label]);
        }

        await t.test('empty database migration, replay, and append-only journal', async () => {
            await owner.query(`SET ROLE "${migrator}"`);
            try {
                assert.deepEqual(fixture.migrationResult.applied, plan.map(row => row.id));
                assert.equal(plan.length, 4);
                assert.equal((await owner.query("SELECT to_regclass('identity.sessions') AS name")).rows[0].name, null);
                const repeat = await applyStage02Migrations(owner, migrationOptions);
                assert.equal(repeat.totalInPlan, plan.length);
                assert.equal(repeat.applied.length, 0);
                await assert.rejects(owner.query('UPDATE ops.schema_migrations SET execution_ms = 0'), /append-only/);
            } finally { await owner.query('RESET ROLE'); }
        });

        await t.test('real pool starts, commits, drains, and rejects checkout after repeated shutdown', async () => {
            const probe = createPostgresPool(fixture.poolConfig, { stage02Only: true });
            try {
                const result = await withTransaction(probe.pool, tx => tx.query('SELECT 1 AS connected'));
                assert.equal(result.rows[0].connected, 1);
                assert.equal(probe.pool.totalCount, 1);
            } finally { await Promise.all([probe.close(), probe.close()]); }
            assert.equal(probe.pool.totalCount, 0);
            await assert.rejects(probe.pool.connect(), /after calling end/);
        });

        await t.test('absent scope denies access and a pooled connection does not retain scope', async () => {
            assert.equal((await db.pool.query('SELECT * FROM product.projects')).rows.length, 0);
            const result = await withScopedTransaction(db.pool, a, tx => tx.query('SELECT project_id FROM product.projects'));
            assert.deepEqual(result.rows.map(row => row.project_id), [a.projectId]);
            assert.equal((await db.pool.query('SELECT * FROM product.projects')).rows.length, 0);
            const other = await withScopedTransaction(db.pool, b, tx => tx.query('SELECT project_id FROM product.projects'));
            assert.deepEqual(other.rows.map(row => row.project_id), [b.projectId]);
        });

        await t.test('applied checksum drift is detected in real PostgreSQL', async () => {
            const migration = loadStage02MigrationPlan()[0];
            // Corrupt only this disposable fixture, then restore the original journal value.
            await owner.query('ALTER TABLE ops.schema_migrations DISABLE TRIGGER schema_migrations_immutable_guard');
            try {
                await owner.query('UPDATE ops.schema_migrations SET checksum=$1 WHERE migration_id=$2', ['f'.repeat(64), migration.id]);
                await assert.rejects(applyStage02Migrations(owner, migrationOptions), /checksum drift/);
                assert.equal((await db.readiness()).migrations, false);
            } finally {
                await owner.query('UPDATE ops.schema_migrations SET checksum=$1 WHERE migration_id=$2', [migration.checksum, migration.id]);
                await owner.query('ALTER TABLE ops.schema_migrations ENABLE TRIGGER schema_migrations_immutable_guard');
            }
        });

        await t.test('cross-workspace writes and composite project foreign keys are denied', async () => {
            await assert.rejects(withScopedTransaction(db.pool, a, tx => tx.query(
                'INSERT INTO product.projects (project_id, workspace_id, slug, title) VALUES ($1, $2, $3, $4)',
                [randomUUID(), b.workspaceId, 'forbidden-project', 'forbidden']
            )), error => error.code === '42501');
            await assert.rejects(withScopedTransaction(db.pool, a, tx => tx.query(
                'INSERT INTO control.outbox (event_id, workspace_id, project_id, topic, payload, payload_digest) VALUES ($1,$2,$3,$4,$5,$6)',
                [randomUUID(), a.workspaceId, b.projectId, 'test', '{}', 'a'.repeat(64)]
            )), error => error.code === '23503');
        });

        await t.test('consumer receipt cannot reference another workspace event', async () => {
            const event = randomUUID();
            await withScopedTransaction(db.pool, b, tx => tx.query(
                'INSERT INTO control.outbox (event_id, workspace_id, project_id, topic, payload, payload_digest) VALUES ($1,$2,$3,$4,$5,$6)',
                [event, b.workspaceId, b.projectId, 'test', '{}', 'b'.repeat(64)]
            ));
            await assert.rejects(withScopedTransaction(db.pool, a, tx => tx.query(
                'INSERT INTO control.consumer_receipts (workspace_id, consumer_name, event_id) VALUES ($1,$2,$3)',
                [a.workspaceId, 'test-consumer', event]
            )), error => error.code === '23503');
        });

        await t.test('rollback removes failed writes on the same client and clears scope', async () => {
            const projectId = randomUUID();
            await assert.rejects(withScopedTransaction(db.pool, a, async tx => {
                await tx.query('INSERT INTO product.projects (project_id, workspace_id, slug, title) VALUES ($1,$2,$3,$4)', [projectId, a.workspaceId, 'rolled-back', 'rollback']);
                throw new Error('intentional rollback');
            }), /intentional rollback/);
            assert.equal((await owner.query('SELECT project_id FROM product.projects WHERE project_id=$1', [projectId])).rows.length, 0);
            assert.equal((await db.pool.query('SELECT * FROM product.projects')).rows.length, 0);
            await withTransaction(db.pool, async tx => assert.equal((await tx.query('SELECT 1 AS value')).rows[0].value, 1));
            const context = (await db.pool.query("SELECT current_setting('asi.workspace_id',true) AS workspace,current_setting('asi.principal_id',true) AS principal,current_setting('asi.project_id',true) AS project")).rows[0];
            assert.ok(Object.values(context).every(value => value === null || value === ''));
        });

        await t.test('committed writes persist after pool shutdown and a separate Node process restart', async () => {
            const eventId = randomUUID();
            const writer = `import {createPostgresPool} from './backend/src/platform/database/pool.js';
                import {withScopedTransaction} from './backend/src/platform/database/transaction.js';
                const db=createPostgresPool({DATABASE_URL:process.env.DATABASE_URL},{stage02Only:true});
                try {await withScopedTransaction(db.pool,JSON.parse(process.env.QUALIFICATION_SCOPE),tx=>tx.query(
                'INSERT INTO control.outbox(event_id,workspace_id,project_id,topic,payload,payload_digest) VALUES($1,$2,$3,$4,$5,$6)',
                [process.env.QUALIFICATION_EVENT,JSON.parse(process.env.QUALIFICATION_SCOPE).workspaceId,JSON.parse(process.env.QUALIFICATION_SCOPE).projectId,'restart-test','{}','a'.repeat(64)]));}
                finally {await Promise.all([db.close(),db.close()]);}
                console.log('COMMITTED_AND_CLOSED');`;
            const reader = `import {createPostgresPool} from './backend/src/platform/database/pool.js';
                import {withScopedTransaction} from './backend/src/platform/database/transaction.js';
                const db=createPostgresPool({DATABASE_URL:process.env.DATABASE_URL},{stage02Only:true});
                try {const result=await withScopedTransaction(db.pool,JSON.parse(process.env.QUALIFICATION_SCOPE),tx=>tx.query(
                'SELECT event_id FROM control.outbox WHERE event_id=$1',[process.env.QUALIFICATION_EVENT]));
                if(result.rowCount!==1)throw new Error('PERSISTENCE_FAILED');}
                finally {await db.close();} console.log('PERSISTENCE_VERIFIED');`;
            const env = { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, TEMP: process.env.TEMP,
                DATABASE_URL: fixture.runtimeUrl.href, QUALIFICATION_SCOPE: JSON.stringify(a), QUALIFICATION_EVENT: eventId };
            const written = await run(process.execPath, ['--input-type=module', '-e', writer], { env, timeout: 15000 });
            assert.equal(written.stdout.trim(), 'COMMITTED_AND_CLOSED');
            const read = await run(process.execPath, ['--input-type=module', '-e', reader], { env, timeout: 15000 });
            assert.equal(read.stdout.trim(), 'PERSISTENCE_VERIFIED');
            await assert.rejects(withScopedTransaction(db.pool, a, tx => tx.query(
                'INSERT INTO control.outbox(event_id,workspace_id,project_id,topic,payload,payload_digest) VALUES($1,$2,$3,$4,$5,$6)',
                [eventId, a.workspaceId, a.projectId, 'duplicate', '{}', 'a'.repeat(64)])), error => error.code === '23505');
            for (const [topic, digest, expected] of [['', 'a'.repeat(64), '23514'], ['test', 'invalid', '23514'], [null, 'a'.repeat(64), '23502']]) {
                await assert.rejects(withScopedTransaction(db.pool, a, tx => tx.query(
                    'INSERT INTO control.outbox(event_id,workspace_id,project_id,topic,payload,payload_digest) VALUES($1,$2,$3,$4,$5,$6)',
                    [randomUUID(), a.workspaceId, a.projectId, topic, '{}', digest])), error => error.code === expected);
            }
        });

        await t.test('runtime cannot create schemas, mutate journal, or bypass RLS', async () => {
            await assert.rejects(db.pool.query('CREATE TABLE product.forbidden (id integer)'), error => error.code === '42501');
            await assert.rejects(db.pool.query('DELETE FROM ops.schema_migrations'), error => error.code === '42501');
            const role = await db.pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user');
            assert.equal(role.rows[0].rolsuper, false);
            assert.equal(role.rows[0].rolbypassrls, false);
            const state = await db.readiness();
            assert.equal(state.runtimeRole, true);
            assert.equal(state.schemas, true);
            assert.equal(state.migrations, true);
        });

        await t.test('pgvector is installed and real exact cosine search returns the expected neighbor', async () => {
            const available = await owner.query('SELECT default_version FROM pg_available_extensions WHERE name=$1', ['vector']);
            assert.equal(available.rows.length, 1, 'PGVECTOR_INSTALL_REQUIRED: install the extension files using scripts/install-pgvector.ps1 as Administrator.');
            await owner.query('CREATE EXTENSION vector');
            await owner.query('CREATE TABLE public.vector_probe (id integer PRIMARY KEY, embedding vector(3))');
            await owner.query('INSERT INTO public.vector_probe VALUES (1,$1),(2,$2)', ['[1,0,0]', '[0,1,0]']);
            const nearest = await owner.query('SELECT id FROM public.vector_probe ORDER BY embedding <=> $1::vector LIMIT 1', ['[1,0.1,0]']);
            assert.equal(nearest.rows[0].id, 1);
            assert.equal((await db.readiness()).vector, true);
        });

        await t.test('real readiness HTTP reports healthy dependencies and fails closed on database loss', async () => {
            const dead = createPostgresPool({ DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unavailable', DATABASE_TIMEOUT_MS: 200 }, { stage02Only: true });
            let healthy = true;
            const app = createApp({ config: loadConfig({ DATABASE_URL: fixture.runtimeUrl.href }), readiness: () => (healthy ? db : dead).readiness() });
            const server = app.listen(0, '127.0.0.1');
            try {
                await new Promise(resolve => server.once('listening', resolve));
                const address = server.address();
                assert.ok(address && typeof address !== 'string');
                const base = 'http://127.0.0.1:' + address.port;
                for (const route of ['/health/ready', '/api/v1/health/ready']) {
                    const response = await fetch(base + route);
                    assert.equal(response.status, 200);
                    const body = await response.json();
                    if (route === '/health/ready') assert.deepEqual(body, { ready: true });
                    else { assert.equal(body.status, 'ready'); assert.equal(body.vector, true); }
                }
                healthy = false;
                const failed = await fetch(base + '/health/ready');
                assert.equal(failed.status, 503);
                assert.deepEqual(await failed.json(), { ready: false });
                assert.equal((await fetch(base + '/health/live')).status, 200);
            } finally {
                await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve(undefined)));
                await dead.close();
            }
        });

        await t.test('native PostgreSQL backup restores schema and fixture data to a fresh database', async () => {
            const directory = await mkdtemp(join(tmpdir(), 'asi-db-restore-'));
            const restoreName = database + '_restore';
            let restoreCreated = false;
            let restored;
            const postgresBin = process.env.POSTGRES_BIN ?? 'C:/Program Files/PostgreSQL/17/bin';
            const executable = name => join(postgresBin, process.platform === 'win32' ? name + '.exe' : name);
            const env = { ...process.env, PGHOST: ownerUrl.hostname, PGPORT: ownerUrl.port || '5432', PGUSER: decodeURIComponent(ownerUrl.username), PGPASSWORD: decodeURIComponent(ownerUrl.password), PGDATABASE: database };
            try {
                const backup = join(directory, 'fixture.dump');
                await run(executable('pg_dump'), ['--format=custom', '--no-owner', '--no-privileges', '--file', backup], { env, timeout: 30000 });
                await admin.query(`CREATE DATABASE "${restoreName}" TEMPLATE template0`);
                restoreCreated = true;
                await run(executable('pg_restore'), ['--no-owner', '--no-privileges', '--exit-on-error', '--dbname', restoreName, backup], { env, timeout: 30000 });
                const restoreUrl = new URL(ownerUrl);
                restoreUrl.pathname = '/' + restoreName;
                restored = new pg.Client({ connectionString: restoreUrl.href });
                await restored.connect();
                assert.equal((await restored.query('SELECT count(*) FROM product.projects')).rows[0].count, '2');
                assert.equal((await restored.query('SELECT count(*) FROM ops.schema_migrations')).rows[0].count, String(plan.length));
            } finally {
                if (restored) await restored.end();
                if (restoreCreated) await admin.query(`DROP DATABASE "${restoreName}" WITH (FORCE)`);
                // This directory was created by mkdtemp for this invocation only.
                assert.ok(directory.startsWith(join(tmpdir(), 'asi-db-restore-')));
                await rm(directory, { recursive: true, force: true });
            }
        });

        await t.test('DPAPI-protected encrypted backup authenticates before restoring and refuses an occupied target', async () => {
            const backup = await createEncryptedDatabaseBackup(ownerUrl.href);
            const tampered = backup + '.tampered.asbak';
            const restoreName = database + '_secure';
            let created = false;
            let restored;
            try {
                const bytes = await readFile(backup);
                assert.equal(bytes.subarray(0, 8).toString(), 'ASIBAK01');
                bytes[bytes.length - 1] ^= 1;
                await writeFile(tampered, bytes, { flag: 'wx', mode: 0o600 });
                await admin.query(`CREATE DATABASE "${restoreName}" TEMPLATE template0`);
                created = true;
                const restoreUrl = new URL(ownerUrl);
                restoreUrl.pathname = '/' + restoreName;
                await assert.rejects(restoreEncryptedDatabaseBackup(restoreUrl.href, tampered), /restore failed/);
                restored = new pg.Client({ connectionString: restoreUrl.href });
                await restored.connect();
                assert.equal((await restored.query("SELECT to_regclass('product.projects') AS name")).rows[0].name, null);
                await restoreEncryptedDatabaseBackup(restoreUrl.href, backup);
                assert.equal((await restored.query('SELECT count(*) FROM product.projects')).rows[0].count, '2');
                await assert.rejects(restoreEncryptedDatabaseBackup(restoreUrl.href, backup), /restore failed/);
                assert.equal((await restored.query('SELECT count(*) FROM product.projects')).rows[0].count, '2');
            } finally {
                if (restored) await restored.end();
                if (created) await admin.query(`DROP DATABASE "${restoreName}" WITH (FORCE)`);
                await unlink(backup);
                await unlink(tampered);
            }
        });
    } finally { await fixture.close(); }
});
