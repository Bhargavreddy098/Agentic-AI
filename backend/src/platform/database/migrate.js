// @ts-check
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { TARGET_LOGICAL_SCHEMAS } from './pool.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const validMigrationFile = /^\d{3}-[a-z0-9-]+\.sql$/;

/**
 * Immutable SHA-256 checksum manifest for Stage 02 V1 logical-schema migrations.
 */
export const STAGE02_MIGRATION_CHECKSUMS = Object.freeze({
    '001-schemas-and-journal.sql':
        'f3a93074c5bccbaa829d566751bd3f34238acc415d1c54b56c7be68b97cc678d',
    '002-scope-and-rls-foundations.sql':
        'af229eb6877ef95546a62587f1671b589b00ca56dbdcf1d291742053d903a76a',
    '003-idempotency-and-outbox.sql':
        'db3a8b4b177e3d27b7bad555ce8a415feb243486ae031a645ad936ba8d216207',
});

/**
 * Load and verify the immutable ordered Stage 02 migration files from disk.
 *
 * @param {{ root?: string, migrationsDir?: string, checksumManifest?: Record<string, string> }} [options]
 */
export function loadStage02MigrationPlan(options = {}) {
    const root = options.root ?? repositoryRoot;
    const migrationsDir = options.migrationsDir ?? resolve(root, 'backend/database/migrations/v1');
    const checksumManifest = options.checksumManifest ?? STAGE02_MIGRATION_CHECKSUMS;

    if (!existsSync(migrationsDir)) {
        throw new Error(`Stage 02 migrations directory does not exist: ${migrationsDir}`);
    }

    const files = readdirSync(migrationsDir).sort();
    if (files.length === 0) {
        throw new Error('Stage 02 migrations directory is empty');
    }

    const expectedFiles = Object.keys(checksumManifest).sort();
    if (files.length !== expectedFiles.length || files.some((f, idx) => f !== expectedFiles[idx])) {
        throw new Error('Stage 02 migration files on disk do not match immutable checksum manifest');
    }

    /** @type {Array<{ id: string, file: string, checksum: string, sql: string }>} */
    const plan = [];
    for (const file of files) {
        if (!validMigrationFile.test(file)) {
            throw new Error(`Invalid migration file name: ${file}`);
        }
        const bytes = readFileSync(resolve(migrationsDir, file));
        const checksum = createHash('sha256').update(bytes).digest('hex');
        const expected = checksumManifest[file];
        if (!expected || checksum !== expected) {
            throw new Error(`Checksum mismatch for migration ${file}`);
        }
        plan.push({
            id: file,
            file,
            checksum,
            sql: bytes.toString('utf8'),
        });
    }

    return Object.freeze(plan);
}

/**
 * Apply Stage 02 logical schema migrations using an advisory transaction lock and
 * the immutable `ops.schema_migrations` journal.
 *
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<any>, processID?: number }} client
 * @param {{ root?: string, migrationsDir?: string, checksumManifest?: Record<string, string> }} [options]
 */
export async function applyStage02Migrations(client, options = {}) {
    if (!client || typeof client.query !== 'function') {
        throw new Error('A connected PostgreSQL client is required to apply migrations');
    }

    const plan = loadStage02MigrationPlan(options);
    /** @type {string[]} */
    const applied = [];

    await client.query('BEGIN');
    try {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
            'asi-v1-stage02-migrations',
        ]);

        // Ensure ops schema and ops.schema_migrations journal exist with immutability guard
        await client.query('CREATE SCHEMA IF NOT EXISTS ops');
        await client.query(`
            CREATE TABLE IF NOT EXISTS ops.schema_migrations (
                migration_id text PRIMARY KEY,
                checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
                execution_ms integer NOT NULL DEFAULT 0 CHECK (execution_ms >= 0),
                applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
            )
        `);

        for (const migration of plan) {
            const existing = await client.query(
                'SELECT checksum FROM ops.schema_migrations WHERE migration_id = $1',
                [migration.id]
            );
            if (existing.rows.length > 0) {
                if (existing.rows[0].checksum !== migration.checksum) {
                    throw new Error(`Applied migration checksum drift detected for ${migration.id}`);
                }
                continue;
            }

            const startedAt = Date.now();
            await client.query(migration.sql);
            const executionMs = Math.max(0, Date.now() - startedAt);
            await client.query(
                'INSERT INTO ops.schema_migrations (migration_id, checksum, execution_ms) VALUES ($1, $2, $3)',
                [migration.id, migration.checksum, executionMs]
            );
            applied.push(migration.id);
        }

        // Verify all 9 logical schemas exist before committing
        const schemaCheck = await client.query(
            'SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])',
            [TARGET_LOGICAL_SCHEMAS]
        );
        const existingSchemas = new Set((schemaCheck.rows ?? []).map((/** @type {any} */ r) => r.nspname));
        for (const requiredSchema of TARGET_LOGICAL_SCHEMAS) {
            if (!existingSchemas.has(requiredSchema)) {
                throw new Error(`Required logical schema missing after migration: ${requiredSchema}`);
            }
        }

        await client.query('COMMIT');
        return { applied, totalInPlan: plan.length };
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    }
}
