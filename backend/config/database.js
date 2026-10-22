// @ts-check
import { createPostgresPool } from '../src/platform/database/pool.js';

/**
 * @param {ReturnType<import('./env.js').loadConfig>} config
 */
export function createDatabase(config) {
    return createPostgresPool(config);
}

