import { Pool } from 'pg';
export function createDatabase(config) {
    const pool = new Pool({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX, connectionTimeoutMillis: config.DATABASE_TIMEOUT_MS, statement_timeout: config.DATABASE_TIMEOUT_MS, idleTimeoutMillis: 10000 });
    pool.on('error', () => { });
    return {
        async readiness() { let postgres = false, vector = false; try {
            await pool.query('SELECT 1');
            postgres = true;
            const result = await pool.query("SELECT 1 FROM pg_extension WHERE extname = 'vector'");
            vector = result.rowCount === 1;
        }
        catch { /* Keep connection details private. */ } return { postgres, vector }; },
        close: () => pool.end(),
    };
}
