// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createPostgresPool,
    TARGET_LOGICAL_SCHEMAS,
    withTransaction,
    withScopedTransaction,
    assertUuid,
    toDecimalWireString,
    createSqlRepositoryPort,
    STAGE02_MIGRATION_CHECKSUMS,
    loadStage02MigrationPlan,
    applyStage02Migrations,
} from '../../src/platform/database/index.js';

const WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL_A = '22222222-2222-4222-8222-222222222222';
const PROJECT_A = '33333333-3333-4333-8333-333333333333';

test('Stage 02 target logical schemas match 04-DATABASE.md exactly', () => {
    assert.deepEqual(TARGET_LOGICAL_SCHEMAS, [
        'identity',
        'product',
        'planning',
        'control',
        'inference',
        'knowledge',
        'verification',
        'automation',
        'ops',
    ]);
});

test('Stage 02 migration plan verifies SHA-256 checksums and rejects tampered checksum manifests', () => {
    const plan = loadStage02MigrationPlan();
    assert.equal(plan.length, 3);
    assert.deepEqual(
        plan.map(m => m.id),
        [
            '001-schemas-and-journal.sql',
            '002-scope-and-rls-foundations.sql',
            '003-idempotency-and-outbox.sql',
        ]
    );
    for (const m of plan) {
        assert.equal(m.checksum, STAGE02_MIGRATION_CHECKSUMS[m.id]);
    }

    assert.throws(
        () =>
            loadStage02MigrationPlan({
                checksumManifest: {
                    ...STAGE02_MIGRATION_CHECKSUMS,
                    '001-schemas-and-journal.sql': '0'.repeat(64),
                },
            }),
        /Checksum mismatch/
    );
});

test('withScopedTransaction binds transaction-local RLS scope and resets it before releasing client', async () => {
    /** @type {Array<{ sql: string, values?: unknown[] }>} */
    const recorded = [];
    const client = {
        async query(sql, values) {
            recorded.push({ sql: sql.trim(), values });
            return { rows: [] };
        },
        release() {
            recorded.push({ sql: 'RELEASE' });
        },
    };
    const pool = {
        connect: async () => client,
    };

    const output = await withScopedTransaction(
        pool,
        { workspaceId: WORKSPACE_A, principalId: PRINCIPAL_A, projectId: PROJECT_A },
        async (txClient) => {
            assert.equal(txClient, client);
            await txClient.query('SELECT * FROM product.projects WHERE project_id = $1', [PROJECT_A]);
            return 'ok';
        }
    );

    assert.equal(output, 'ok');
    assert.equal(recorded[0].sql, 'BEGIN');
    assert.ok(recorded[1].sql.includes("set_config('asi.workspace_id', $1, true)"));
    assert.deepEqual(recorded[1].values, [WORKSPACE_A, PRINCIPAL_A, PROJECT_A]);
    assert.equal(recorded[2].sql, 'SELECT * FROM product.projects WHERE project_id = $1');
    assert.ok(recorded[3].sql.includes("set_config('asi.workspace_id', '', true)"));
    assert.equal(recorded[4].sql, 'COMMIT');
    assert.equal(recorded[5].sql, 'RELEASE');
});

test('withScopedTransaction rejects missing or invalid UUID workspace scope before checking out client', async () => {
    let connected = false;
    const pool = {
        connect: async () => {
            connected = true;
            return { query: async () => ({ rows: [] }), release() {} };
        },
    };
    await assert.rejects(
        () => withScopedTransaction(pool, { workspaceId: 'not-a-uuid' }, async () => {}),
        /valid UUID workspaceId/
    );
    assert.equal(connected, false);
});

test('applyStage02Migrations applies unapplied migrations, skips applied ones, and rejects checksum drift', async () => {
    /** @type {Map<string, string>} */
    const journal = new Map();
    const client = {
        async query(sql, values = []) {
            if (sql.includes('SELECT checksum FROM ops.schema_migrations')) {
                const id = String(values[0]);
                const existing = journal.get(id);
                return { rows: existing ? [{ checksum: existing }] : [] };
            }
            if (sql.includes('INSERT INTO ops.schema_migrations')) {
                journal.set(String(values[0]), String(values[1]));
                return { rowCount: 1, rows: [] };
            }
            if (sql.includes('SELECT nspname FROM pg_namespace')) {
                return { rows: TARGET_LOGICAL_SCHEMAS.map(nspname => ({ nspname })) };
            }
            return { rows: [] };
        },
    };

    const firstRun = await applyStage02Migrations(client);
    assert.equal(firstRun.applied.length, 3);
    assert.equal(journal.size, 3);

    const secondRun = await applyStage02Migrations(client);
    assert.equal(secondRun.applied.length, 0);

    // Simulate tampered checksum in database journal
    journal.set('002-scope-and-rls-foundations.sql', 'f'.repeat(64));
    await assert.rejects(
        () => applyStage02Migrations(client),
        /Applied migration checksum drift detected/
    );
});

test('64-bit decimal wire helper and SQL repository port enforce strict types', () => {
    assert.equal(toDecimalWireString(9007199254740993n, 'micro_usd'), '9007199254740993');
    assert.equal(toDecimalWireString('9007199254740993', 'micro_usd'), '9007199254740993');
    assert.throws(() => toDecimalWireString(12.34, 'micro_usd'), /Unsafe integer/);
    assert.equal(assertUuid(WORKSPACE_A, 'workspaceId'), WORKSPACE_A);

    const repo = createSqlRepositoryPort({
        pool: { connect: async () => ({}) },
        schema: 'product',
        table: 'projects',
    });
    assert.equal(repo.qualifiedTable, '"product"."projects"');
});

test('createPostgresPool configures timeouts, handles unreachable database gracefully, and closes idempotently', async () => {
    let endCalls = 0;
    class FakePool {
        /** @param {any} opts */
        constructor(opts) {
            this.opts = opts;
        }
        on() {}
        async connect() {
            throw new Error('ECONNREFUSED');
        }
        async end() {
            endCalls += 1;
        }
    }

    const db = createPostgresPool(
        {
            DATABASE_URL: 'postgresql://127.0.0.1:5432/asi_memory',
            DATABASE_POOL_MAX: 8,
            DATABASE_TIMEOUT_MS: 3000,
            DATABASE_STATEMENT_TIMEOUT_MS: 12000,
        },
        { PoolClass: /** @type {any} */ (FakePool) }
    );

    assert.equal(db.config.max, 8);
    assert.equal(db.config.connectionTimeoutMillis, 3000);
    assert.equal(db.config.statementTimeoutMs, 12000);

    const ready = await db.readiness();
    assert.equal(ready.postgres, false);
    assert.equal(ready.vector, false);

    await Promise.all([db.close(), db.close()]);
    assert.equal(endCalls, 1);
});
