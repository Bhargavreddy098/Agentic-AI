import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createSpecialistService } from './services/specialist.service.js';
import { createSpecialistRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    clients = {},
    logger = undefined,
    readiness = async () => ({ workers: true }),
} = {}) {
    const specialistService = createSpecialistService({ ...owners, clients });
    const app = createServiceApp({
        serviceName: 'specialist',
        config,
        internalRouter: createSpecialistRoutes(specialistService),
        readiness,
        logger,
    });
    app.locals.specialistService = specialistService;
    return app;
}
