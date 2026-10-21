import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createEpisodeService } from './services/episode.service.js';
import { createEpisodeRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    owners = {},
    logger = undefined,
    readiness = async () => ({ sqlite: true }),
} = {}) {
    const episodeService = createEpisodeService(owners);
    const app = createServiceApp({
        serviceName: 'episode',
        config,
        internalRouter: createEpisodeRoutes(episodeService),
        readiness,
        logger,
    });
    app.locals.episodeService = episodeService;
    return app;
}
