// @ts-check

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Execute work inside an explicit PostgreSQL transaction using a single checked-out client.
 * Guarantees BEGIN / COMMIT / ROLLBACK and releases the exact same client back to the pool.
 *
 * @template T
 * @param {{ connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<any>, release: (err?: unknown) => void }> }} pool
 * @param {(client: { query: (sql: string, values?: unknown[]) => Promise<any>, release: (err?: unknown) => void }) => Promise<T>} work
 * @param {{ signal?: AbortSignal, statementTimeoutMs?: number, isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }} [options]
 * @returns {Promise<T>}
 */
export async function withTransaction(pool, work, options = {}) {
    if (!pool || typeof pool.connect !== 'function') {
        throw new Error('withTransaction requires a PostgreSQL pool with connect()');
    }
    options.signal?.throwIfAborted();
    if (options.isolationLevel !== undefined && !['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'].includes(options.isolationLevel)) {
        throw new Error('Invalid isolationLevel');
    }
    const client = await pool.connect();
    let discard;
    try {
        options.signal?.throwIfAborted();
        const beginSql = options.isolationLevel
            ? `BEGIN ISOLATION LEVEL ${options.isolationLevel}`
            : 'BEGIN';
        await client.query(beginSql);
        if (options.statementTimeoutMs !== undefined) {
            const timeout = Number(options.statementTimeoutMs);
            if (!Number.isInteger(timeout) || timeout < 50 || timeout > 300000) {
                throw new Error('Invalid statementTimeoutMs');
            }
            await client.query(`SET LOCAL statement_timeout = ${timeout}`);
        }
        const result = await work(client);
        options.signal?.throwIfAborted();
        await client.query('COMMIT');
        return result;
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch {
            // A connection whose rollback failed must never return to the idle pool.
            discard = new Error('Transaction rollback failed');
        }
        throw error;
    } finally {
        client.release(discard);
    }
}


/**
 * Execute work inside a workspace/principal-scoped PostgreSQL transaction for Row-Level Security (RLS).
 * Binds `asi.workspace_id`, `asi.principal_id`, and optional `asi.project_id` with `SET LOCAL` (is_local = true)
 * and explicitly clears session variables before releasing the pooled connection.
 *
 * @template T
 * @param {{ connect: () => Promise<{ query: (sql: string, values?: unknown[]) => Promise<any>, release: (err?: unknown) => void }> }} pool
 * @param {{ workspaceId: string, principalId?: string, projectId?: string }} scope
 * @param {(client: { query: (sql: string, values?: unknown[]) => Promise<any>, release: (err?: unknown) => void }) => Promise<T>} work
 * @param {{ statementTimeoutMs?: number, isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' }} [options]
 * @returns {Promise<T>}
 */
export async function withScopedTransaction(pool, scope, work, options = {}) {
    if (!scope || typeof scope.workspaceId !== 'string' || !UUID_REGEX.test(scope.workspaceId)) {
        throw new Error('withScopedTransaction requires a valid UUID workspaceId');
    }
    if (scope.principalId !== undefined && !UUID_REGEX.test(scope.principalId)) {
        throw new Error('withScopedTransaction requires a valid UUID principalId when provided');
    }
    if (scope.projectId !== undefined && !UUID_REGEX.test(scope.projectId)) {
        throw new Error('withScopedTransaction requires a valid UUID projectId when provided');
    }

    return withTransaction(
        pool,
        async (client) => {
            await client.query(
                `SELECT
                    set_config('asi.workspace_id', $1, true),
                    set_config('asi.principal_id', $2, true),
                    set_config('asi.project_id', $3, true)`,
                [scope.workspaceId, scope.principalId ?? '', scope.projectId ?? '']
            );
            try {
                return await work(client);
            } finally {
                await client
                    .query(
                        `SELECT
                            set_config('asi.workspace_id', '', true),
                            set_config('asi.principal_id', '', true),
                            set_config('asi.project_id', '', true)`
                    )
                    .catch(() => undefined);
            }
        },
        options
    );
}
