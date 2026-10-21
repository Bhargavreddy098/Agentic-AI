import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createCoreService } from './services/core.service.js';
import { createCoreRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    logger = undefined,
    readiness = async () => ({ postgres: true }),
} = {}) {
    const coreService = createCoreService(owners);
    const app = createServiceApp({
        serviceName: 'core',
        config,
        internalRouter: createCoreRoutes(coreService),
        readiness,
        logger,
    });
    app.locals.coreService = coreService;
    return app;
}
