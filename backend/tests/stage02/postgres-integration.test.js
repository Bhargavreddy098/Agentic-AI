// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createPostgresPool,
    applyStage02Migrations,
    withScopedTransaction,
    TARGET_LOGICAL_SCHEMAS,
} from '../../src/platform/database/index.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://127.0.0.1:5432/asi_memory';

test('Stage 02 real PostgreSQL integration (executes when local PostgreSQL is reachable)', async (t) => {
    const db = createPostgresPool({
        DATABASE_URL,
        DATABASE_TIMEOUT_MS: 1500,
    });

    try {
        const probe = await db.readiness();
        if (!probe.postgres) {
            t.skip('DATABASE_CONNECTION_REQUIRED: Local PostgreSQL at DATABASE_URL is not reachable');
            return;
        }

        const client = await db.pool.connect();
        try {
            const first = await applyStage02Migrations(client);
            assert.equal(first.totalInPlan, 3);
            const second = await applyStage02Migrations(client);
            assert.equal(second.applied.length, 0);

            const schemas = await client.query(
                'SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])',
                [TARGET_LOGICAL_SCHEMAS]
            );
            assert.equal(schemas.rows.length, TARGET_LOGICAL_SCHEMAS.length);
        } finally {
            client.release();
        }

        const wA = '11111111-1111-4111-8111-111111111111';
        const pA = '22222222-2222-4222-8222-222222222222';
        const projA = '33333333-3333-4333-8333-333333333333';

        await withScopedTransaction(db.pool, { workspaceId: wA, principalId: pA }, async (tx) => {
            await tx.query(
                `INSERT INTO identity.principals (principal_id, kind, display_name)
                 VALUES ($1, 'owner', 'Local Owner')
                 ON CONFLICT (principal_id) DO NOTHING`,
                [pA]
            );
            await tx.query(
                `INSERT INTO identity.workspaces (workspace_id, owner_principal_id, slug, display_name)
                 VALUES ($1, $2, 'local-main', 'Local Workspace')
                 ON CONFLICT (workspace_id) DO NOTHING`,
                [wA, pA]
            );
            await tx.query(
                `INSERT INTO product.projects (project_id, workspace_id, slug, title)
                 VALUES ($1, $2, 'demo-project', 'Demo Project')
                 ON CONFLICT (project_id) DO NOTHING`,
                [projA, wA]
            );
            const rows = await tx.query('SELECT project_id FROM product.projects WHERE project_id = $1', [projA]);
            assert.equal(rows.rows.length, 1);
        });
    } finally {
        await db.close();
    }
});
