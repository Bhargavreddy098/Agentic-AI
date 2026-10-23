// @ts-check
import pg from 'pg';
import { TARGET_LOGICAL_SCHEMAS } from './schemas.js';
import { loadStage02MigrationPlan } from './migrate.js';

const { Pool } = pg;

export { TARGET_LOGICAL_SCHEMAS } from './schemas.js';

/**
 * Create the canonical PostgreSQL connection pool owner with bounded connection/statement timeouts,
 * readiness probing (PostgreSQL connectivity + pgvector extension + logical schemas), and idempotent shutdown.
 *
 * @param {{
 *   DATABASE_URL: string,
 *   DATABASE_POOL_MAX?: number,
 *   DATABASE_TIMEOUT_MS?: number,
 *   DATABASE_STATEMENT_TIMEOUT_MS?: number
 * }} config
 * @param {{ PoolClass?: typeof Pool, stage02Only?: boolean, stage03Only?: boolean, stage04Only?: boolean, stage05Only?: boolean, stage06Only?: boolean }} [deps]
 */
export function createPostgresPool(config, deps = {}) {
    if (!config?.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(config.DATABASE_URL)) {
        throw new Error('Invalid PostgreSQL configuration: DATABASE_URL is required');
    }
    const PoolImpl = deps.PoolClass ?? Pool;
    const connectionTimeoutMillis = config.DATABASE_TIMEOUT_MS ?? 5000;
    const statementTimeoutMs = config.DATABASE_STATEMENT_TIMEOUT_MS ?? 15000;
    const max = config.DATABASE_POOL_MAX ?? 5;
    const expectedMigrations = loadStage02MigrationPlan({ stage02Only: deps.stage02Only, stage03Only: deps.stage03Only, stage04Only: deps.stage04Only, stage05Only: deps.stage05Only, stage06Only: deps.stage06Only });
    const knownMigrations = loadStage02MigrationPlan();

    const pool = new PoolImpl({
        connectionString: config.DATABASE_URL,
        max,
        connectionTimeoutMillis,
        idleTimeoutMillis: 10000,
        statement_timeout: statementTimeoutMs,
        query_timeout: statementTimeoutMs,
        application_name: 'asi-v1-control-plane',
    });

    pool.on?.('error', () => {
        /* Pool background errors are handled via readiness/checkout without crashing the process or leaking secrets */
    });

    /** @type {Promise<void> | undefined} */
    let closing;

    return {
        pool,
        config: Object.freeze({
            max,
            connectionTimeoutMillis,
            statementTimeoutMs,
        }),
        async readiness() {
            let client;
            try {
                client = await pool.connect();
                const extResult = await client.query(
                    `SELECT
                        EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector') AS vector_installed,
                        EXISTS(SELECT 1 FROM pg_available_extensions WHERE name = 'vector') AS vector_available,
                        to_regclass('ops.schema_migrations') IS NOT NULL AS migrations_journal`
                );
                const row = extResult.rows?.[0] ?? {};
                const schemaResult = await client.query(
                    'SELECT nspname FROM pg_namespace WHERE nspname = ANY($1::text[])',
                    [TARGET_LOGICAL_SCHEMAS]
                );
                const schemas = TARGET_LOGICAL_SCHEMAS.every(schema =>
                    schemaResult.rows.some(record => record.nspname === schema));
                let migrations = false;
                if (row.migrations_journal) {
                    const journal = await client.query('SELECT migration_id, checksum FROM ops.schema_migrations');
                    migrations = expectedMigrations.every(expected => journal.rows.some(
                        actual => actual.migration_id === expected.id && actual.checksum === expected.checksum
                    )) && journal.rows.every(actual => knownMigrations.some(
                        expected => actual.migration_id === expected.id && actual.checksum === expected.checksum));
                }
                const roleResult = await client.query(`SELECT NOT (
                    r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole
                    OR EXISTS (SELECT 1 FROM pg_namespace n WHERE n.nspname = ANY($1::text[])
                        AND has_schema_privilege(current_user, n.oid, 'CREATE'))
                    OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = ANY($1::text[]) AND c.relkind IN ('r', 'p')
                        AND pg_has_role(current_user, c.relowner, 'USAGE'))
                ) AS runtime_role FROM pg_roles r WHERE r.rolname = current_user`, [TARGET_LOGICAL_SCHEMAS]);
                return {
                    postgres: true,
                    vector: Boolean(row.vector_installed),
                    vectorAvailable: Boolean(row.vector_available || row.vector_installed),
                    migrationsJournal: Boolean(row.migrations_journal),
                    schemas,
                    migrations,
                    runtimeRole: roleResult.rows[0]?.runtime_role === true,
                };
            } catch {
                return {
                    postgres: false,
                    vector: false,
                    vectorAvailable: false,
                    migrationsJournal: false,
                    schemas: false,
                    migrations: false,
                    runtimeRole: false,
                };
            } finally {
                client?.release();
            }
        },
        close() {
            return (closing ??= pool.end());
        },
    };
}
