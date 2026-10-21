import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createOrchestratorService } from './services/orchestrator.service.js';
import { createOrchestratorRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    clients = {},
    logger = undefined,
    readiness = async () => ({ orchestrator: true }),
} = {}) {
    const orchestratorService = createOrchestratorService({ ...owners, clients });
    const app = createServiceApp({
        serviceName: 'orchestrator',
        config,
        internalRouter: createOrchestratorRoutes(orchestratorService),
        readiness,
        logger,
    });
    app.locals.orchestratorService = orchestratorService;
    return app;
}
