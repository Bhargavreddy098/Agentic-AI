// @ts-check
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { requestContext } from './middlewares/request-context.js';
import { requestRateLimit } from './middlewares/rate-limit.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFound } from './middlewares/not-found.js';
import { healthRoutes } from './routes/health.routes.js';
import { uiRoutes } from './routes/index.js';

/**
 * @param {{
 *   config: ReturnType<import('./config/env.js').loadConfig>,
 *   services?: Object,
 *   logger?: import('pino').Logger,
 *   readiness?: () => Promise<{postgres: boolean, vector: boolean, migrations?: boolean}>
 * }} options
 */
export function createApp({
    config,
    services = {},
    logger = undefined,
    readiness = async () => ({ postgres: false, vector: false }),
}) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    const helmetOptions = process.env.CSP_HEADER_VALUE
        ? {
              frameguard: false,
              contentSecurityPolicy: {
                  directives: {
                      frameAncestors: ["'self'", 'https://*.google.com', 'https://localhost.corp.google.com:26001'],
                  },
              },
          }
        : {};
    app.use(requestContext, helmet(helmetOptions), requestRateLimit(), cookieParser());
    if (logger) {
        app.use(
            pinoHttp({
                logger,
                genReqId: (_req, res) => String(res.getHeader('x-request-id') ?? ''),
                serializers: {
                    req: req => ({ method: req.method, url: String(req.url).split('?')[0] }),
                    res: res => ({ statusCode: res.statusCode }),
                },
            })
        );
    }
    app.get('/', (_req, res) =>
        res.json({
            service: 'asi-express-backend',
            architecture: 'local-first-v1-control-plane',
            status: 'ok',
            endpoints: {
                healthLive: '/health/live',
                healthReady: '/health/ready',
                apiV1HealthLive: '/api/v1/health/live',
                apiV1HealthReady: '/api/v1/health/ready',
            },
        })
    );
    app.use('/health', healthRoutes(readiness));
    app.use('/api/v1/health', healthRoutes(readiness));
    app.use('/api/ui/v1', uiRoutes({ config, services }));
    app.use(notFound, errorHandler);
    return app;
}

