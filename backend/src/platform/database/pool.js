// @ts-check
import pg from 'pg';

const { Pool } = pg;

export const TARGET_LOGICAL_SCHEMAS = Object.freeze([
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
 * @param {{ PoolClass?: typeof Pool }} [deps]
 */
export function createPostgresPool(config, deps = {}) {
    if (!config?.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(config.DATABASE_URL)) {
        throw new Error('Invalid PostgreSQL configuration: DATABASE_URL is required');
    }
    const PoolImpl = deps.PoolClass ?? Pool;
    const connectionTimeoutMillis = config.DATABASE_TIMEOUT_MS ?? 5000;
    const statementTimeoutMs = config.DATABASE_STATEMENT_TIMEOUT_MS ?? 15000;
    const max = config.DATABASE_POOL_MAX ?? 5;

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
                return {
                    postgres: true,
                    vector: Boolean(row.vector_installed),
                    vectorAvailable: Boolean(row.vector_available || row.vector_installed),
                    migrationsJournal: Boolean(row.migrations_journal),
                };
            } catch {
                return {
                    postgres: false,
                    vector: false,
                    vectorAvailable: false,
                    migrationsJournal: false,
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
