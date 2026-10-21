import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createInferenceService } from './services/inference.service.js';
import { createInferenceRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    logger = undefined,
    readiness = async () => ({ router: true }),
} = {}) {
    const inferenceService = createInferenceService(owners);
    const app = createServiceApp({
        serviceName: 'inference',
        config,
        internalRouter: createInferenceRoutes(inferenceService),
        readiness,
        logger,
    });
    app.locals.inferenceService = inferenceService;
    return app;
}
