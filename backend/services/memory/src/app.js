import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createMemoryService } from './services/memory.service.js';
import { createMemoryRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    logger = undefined,
    readiness = async () => ({ postgres: true, pgvector: true }),
} = {}) {
    const memoryService = createMemoryService(owners);
    const app = createServiceApp({
        serviceName: 'memory',
        config,
        internalRouter: createMemoryRoutes(memoryService),
        readiness,
        logger,
    });
    app.locals.memoryService = memoryService;
    return app;
}
