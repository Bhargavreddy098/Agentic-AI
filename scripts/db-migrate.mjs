// @ts-check
import pg from 'pg';
import { createEncryptedDatabaseBackup } from '../backend/src/platform/database/backup.js';
import {
    loadStage02MigrationPlan,
    applyStage02Migrations,
    TARGET_LOGICAL_SCHEMAS,
} from '../backend/src/platform/database/index.js';

const { Client } = pg;

async function main() {
    const validArgs = ['--plan', '--stage02', '--stage03', '--stage04', '--stage05', '--stage06']; const passedArgs = process.argv.slice(2); const stageArgs = passedArgs.filter(a => ['--stage02', '--stage03', '--stage04', '--stage05', '--stage06'].includes(a)); if (passedArgs.some(a => !validArgs.includes(a)) || stageArgs.length > 1) {
        process.stderr.write('INVALID_ARGUMENT: use --plan and at most one of --stage02, --stage03, --stage04, --stage05, or --stage06.\n');
        process.exitCode = 1;
        return;
    }
    const planOnly = process.argv.includes('--plan');
    const stage02Only = process.argv.includes('--stage02');
    const stage03Only = process.argv.includes('--stage03');
    const stage04Only = process.argv.includes('--stage04');
    const stage05Only = process.argv.includes('--stage05'); const stage06Only = process.argv.includes('--stage06');
    const scope = stage02Only ? 'stage02' : stage03Only ? 'stage03' : stage04Only ? 'stage04' : stage05Only ? 'stage05' : stage06Only ? 'stage06' : 'all';
    const plan = loadStage02MigrationPlan({ stage02Only, stage03Only, stage04Only, stage05Only, stage06Only });

    if (planOnly) {
        process.stdout.write(
            JSON.stringify(
                {
                    mode: 'plan-only',
                    scope,
                    targetSchemas: TARGET_LOGICAL_SCHEMAS,
                    migrations: plan.map(({ id, checksum }) => ({ id, checksum })),
                },
                null,
                2
            ) + '\n'
        );
        return;
    }

    const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!connectionString) {
        process.stderr.write(
            'DATABASE_CONNECTION_REQUIRED: Set MIGRATION_DATABASE_URL or DATABASE_URL before running migrations.\n'
        );
        process.exitCode = 1;
        return;
    }
    const databaseName = decodeURIComponent(new URL(connectionString).pathname.slice(1));
    if (!databaseName || ['postgres', 'template0', 'template1'].includes(databaseName)) {
        process.stderr.write('DEDICATED_DATABASE_REQUIRED: migrations must target an explicit application database, not a PostgreSQL maintenance database.\n');
        process.exitCode = 1;
        return;
    }

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: Number(process.env.DATABASE_TIMEOUT_MS ?? 5000),
        statement_timeout: 30000,
    });

    try {
        const backupConnection = process.env.DATABASE_BACKUP_URL ?? process.env.TEST_DATABASE_ADMIN_URL;
        if (!backupConnection) throw new Error('A privileged backup connection must be configured before migration.');
        const backupUrl = new URL(backupConnection);
        backupUrl.pathname = '/' + databaseName;
        const backup = await createEncryptedDatabaseBackup(backupUrl.href);
        process.stdout.write(`Pre-migration encrypted backup: ${backup}\n`);
        await client.connect();
        const result = await applyStage02Migrations(client, { stage02Only, stage03Only, stage04Only, stage05Only, stage06Only });
        process.stdout.write(
            JSON.stringify(
                {
                    status: 'applied',
                    scope,
                    applied: result.applied,
                    totalInPlan: result.totalInPlan,
                    targetSchemas: TARGET_LOGICAL_SCHEMAS,
                },
                null,
                2
            ) + '\n'
        );
    } catch (error) {
        process.stderr.write(
            `Stage 02 migration application failed: ${error instanceof Error ? error.message : 'Unknown error'}\n`
        );
        process.exitCode = 1;
    } finally {
        await client.end().catch(() => undefined);
    }
}

void main();
