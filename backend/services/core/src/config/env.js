import { loadServiceConfig } from '../../../../utils/service-runtime.js';

export function loadConfig(env = process.env) {
    return loadServiceConfig(env, 'core', { requiresPostgres: true });
}
