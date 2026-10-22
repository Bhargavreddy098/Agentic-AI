// @ts-check
import {
    createPostgresPool,
    loadStage02MigrationPlan,
    TARGET_LOGICAL_SCHEMAS,
} from '../backend/src/platform/database/index.js';

async function main() {
    const offlineOnly = process.argv.includes('--offline');
    const plan = loadStage02MigrationPlan();

    if (offlineOnly) {
        process.stdout.write(
            JSON.stringify(
                {
                    status: 'offline-verified',
                    migrationsVerified: plan.length,
                    targetSchemas: TARGET_LOGICAL_SCHEMAS,
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        process.stderr.write('DATABASE_CONNECTION_REQUIRED: DATABASE_URL is not set.\n');
        process.exitCode = 1;
        return;
    }

    const db = createPostgresPool({
        DATABASE_URL: connectionString,
        DATABASE_TIMEOUT_MS: Number(process.env.DATABASE_TIMEOUT_MS ?? 5000),
    });

    try {
        const readiness = await db.readiness();
        if (!readiness.postgres) {
            process.stderr.write(
                JSON.stringify(
                    {
                        status: 'unavailable',
                        reason: 'PostgreSQL connection refused or unreachable',
                        readiness,
                    },
                    null,
                    2
                ) + '\n'
            );
            process.exitCode = 1;
            return;
        }

        const schemaRes = await db.pool.query(
            'SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[]) ORDER BY nspname ASC',
            [TARGET_LOGICAL_SCHEMAS]
        );
        const schemas = schemaRes.rows.map((/** @type {any} */ r) => r.nspname);

        process.stdout.write(
            JSON.stringify(
                {
                    status: readiness.postgres && readiness.vector && schemas.length === TARGET_LOGICAL_SCHEMAS.length ? 'ready' : 'partial',
                    readiness,
                    schemasPresent: schemas,
                    expectedSchemas: TARGET_LOGICAL_SCHEMAS,
                },
                null,
                2
            ) + '\n'
        );

        if (!readiness.vector || schemas.length !== TARGET_LOGICAL_SCHEMAS.length) {
            process.exitCode = 1;
        }
    } finally {
        await db.close();
    }
}

void main();
