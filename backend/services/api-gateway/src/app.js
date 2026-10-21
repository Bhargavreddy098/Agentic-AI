import { createServiceApp } from '../../../utils/service-runtime.js';
import { loadConfig } from './config/env.js';
import { createGatewayService } from './services/gateway.service.js';
import { createGatewayRoutes } from './routes/index.js';

/**
 * @param {any} [options]
 */
export function createApp({
    config = loadConfig(),
    services = {},
    clients = {},
    logger = undefined,
    readiness = async () => ({ gateway: true }),
} = {}) {
    const gatewayService = createGatewayService({ config, clients, services });
    const app = createServiceApp({
        serviceName: 'api-gateway',
        config,
        publicRouter: createGatewayRoutes({ config, services, gatewayService }),
        internalRouter: null,
        readiness,
        logger,
    });
    app.locals.gatewayService = gatewayService;
    return app;
}
