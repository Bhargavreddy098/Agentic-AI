// @ts-check
import { createPostgresPool } from '../src/platform/database/pool.js';

/**
 * @param {ReturnType<import('./env.js').loadConfig>} config
 * @param {Parameters<typeof createPostgresPool>[1]} [options]
 */
export function createDatabase(config, options) {
    return createPostgresPool(config, options);
}

