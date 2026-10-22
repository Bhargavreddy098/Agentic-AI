// @ts-check
import pg from 'pg';
import {
    loadStage02MigrationPlan,
    applyStage02Migrations,
    TARGET_LOGICAL_SCHEMAS,
} from '../backend/src/platform/database/index.js';

const { Client } = pg;

async function main() {
    const planOnly = process.argv.includes('--plan');
    const plan = loadStage02MigrationPlan();

    if (planOnly) {
        process.stdout.write(
            JSON.stringify(
                {
                    mode: 'plan-only',
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

    const client = new Client({
        connectionString,
        connectionTimeoutMillis: Number(process.env.DATABASE_TIMEOUT_MS ?? 5000),
        statement_timeout: 30000,
    });

    try {
        await client.connect();
        const result = await applyStage02Migrations(client);
        process.stdout.write(
            JSON.stringify(
                {
                    status: 'applied',
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
