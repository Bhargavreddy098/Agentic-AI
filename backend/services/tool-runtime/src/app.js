import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createToolRuntimeService } from './services/tool-runtime.service.js';
import { createToolRuntimeRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    clients = {},
    logger = undefined,
    readiness = async () => ({ registry: true }),
} = {}) {
    const toolRuntimeService = createToolRuntimeService({ ...owners, clients });
    const app = createServiceApp({
        serviceName: 'tool-runtime',
        config,
        internalRouter: createToolRuntimeRoutes(toolRuntimeService),
        readiness,
        logger,
    });
    app.locals.toolRuntimeService = toolRuntimeService;
    return app;
}
