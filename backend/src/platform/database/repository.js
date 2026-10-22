// @ts-check

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_INT_REGEX = /^-?\d+$/;

/**
 * Validate a UUID string before issuing a parameterized SQL query.
 * @param {string} value
 * @param {string} fieldName
 * @returns {string}
 */
export function assertUuid(value, fieldName) {
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
        throw new Error(`Invalid UUID for ${fieldName}`);
    }
    return value.toLowerCase();
}

/**
 * Convert a PostgreSQL 64-bit integer / numeric wire value into a canonical decimal string
 * without floating-point precision loss (required for micro_usd, sequence numbers, and revisions).
 *
 * @param {string | number | bigint} value
 * @param {string} fieldName
 * @returns {string}
 */
export function toDecimalWireString(value, fieldName = 'value') {
    if (typeof value === 'bigint') {
        return value.toString(10);
    }
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
            throw new Error(`Unsafe integer number for ${fieldName}; use bigint or decimal string`);
        }
        return String(value);
    }
    if (typeof value === 'string' && DECIMAL_INT_REGEX.test(value.trim())) {
        return BigInt(value.trim()).toString(10);
    }
    throw new Error(`Invalid 64-bit integer value for ${fieldName}`);
}

/**
 * Create a SQL-first repository port wrapper bound to explicit workspace/project scope rules.
 * Never falls back to in-memory Map storage.
 *
 * @param {{
 *   pool: { connect: () => Promise<any>, query?: (sql: string, values?: unknown[]) => Promise<any> },
 *   schema: string,
 *   table: string
 * }} config
 */
export function createSqlRepositoryPort({ pool, schema, table }) {
    if (!pool || typeof pool.connect !== 'function') {
        throw new Error('SQL repository requires a valid PostgreSQL pool owner');
    }
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema) || !/^[a-z][a-z0-9_]{0,62}$/.test(table)) {
        throw new Error('Invalid SQL identifier for repository port');
    }
    const qualifiedTable = `"${schema}"."${table}"`;

    return Object.freeze({
        schema,
        table,
        qualifiedTable,
        /**
         * Execute a parameterized query using an explicit transaction client.
         * @param {{ query: (sql: string, values?: unknown[]) => Promise<any> }} client
         * @param {string} text
         * @param {unknown[]} [values]
         */
        async queryWithClient(client, text, values = []) {
            if (!client || typeof client.query !== 'function') {
                throw new Error('Repository query requires a checked-out PostgreSQL client');
            }
            if (!Array.isArray(values)) {
                throw new Error('Parameterized SQL values must be an array');
            }
            return client.query(text, values);
        },
    });
}
