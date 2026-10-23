// @ts-check
import {
    createPostgresPool,
    loadStage02MigrationPlan,
    TARGET_LOGICAL_SCHEMAS,
} from '../backend/src/platform/database/index.js';

async function main() {
    const validArgs = ['--offline', '--stage02', '--stage03', '--stage04', '--stage05', '--stage06']; const passedArgs = process.argv.slice(2); const stageArgs = passedArgs.filter(a => ['--stage02', '--stage03', '--stage04', '--stage05', '--stage06'].includes(a)); if (passedArgs.some(a => !validArgs.includes(a)) || stageArgs.length > 1) {
        process.stderr.write('INVALID_ARGUMENT: use --offline and at most one of --stage02, --stage03, --stage04, --stage05, or --stage06.\n');
        process.exitCode = 1;
        return;
    }
    const offlineOnly = process.argv.includes('--offline');
    const stage02Only = process.argv.includes('--stage02');
    const stage03Only = process.argv.includes('--stage03');
    const stage04Only = process.argv.includes('--stage04');
    const stage05Only = process.argv.includes('--stage05'); const stage06Only = process.argv.includes('--stage06');
    const scope = stage02Only ? 'stage02' : stage03Only ? 'stage03' : stage04Only ? 'stage04' : stage05Only ? 'stage05' : stage06Only ? 'stage06' : 'all';
    const plan = loadStage02MigrationPlan({ stage02Only, stage03Only, stage04Only, stage05Only, stage06Only });

    if (offlineOnly) {
        process.stdout.write(
            JSON.stringify(
                {
                    status: 'offline-verified',
                    scope,
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
    }, { stage02Only, stage03Only, stage04Only, stage05Only, stage06Only });

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
        const journal = readiness.migrationsJournal
            ? (await db.pool.query('SELECT migration_id,checksum FROM ops.schema_migrations ORDER BY migration_id')).rows : [];

        process.stdout.write(
            JSON.stringify(
                {
                    status: readiness.postgres && readiness.vector && readiness.schemas && readiness.migrations && readiness.runtimeRole ? 'ready' : 'partial',
                    scope,
                    readiness,
                    schemasPresent: schemas,
                    expectedSchemas: TARGET_LOGICAL_SCHEMAS,
                    migrations: plan.map(expected => ({ id: expected.id,
                        status: journal.some(row => row.migration_id === expected.id && row.checksum === expected.checksum) ? 'applied' : 'missing-or-checksum-mismatch' })),
                },
                null,
                2
            ) + '\n'
        );

        if (!readiness.vector || !readiness.schemas || !readiness.migrations || !readiness.runtimeRole) {
            process.exitCode = 1;
        }
    } finally {
        await db.close();
    }
}

void main();
