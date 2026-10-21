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
/** @param {{config: ReturnType<import('./config/env.js').loadConfig>, services?: Object, logger?: import('pino').Logger, readiness?:()=>Promise<{postgres:boolean,vector:boolean}>}} options */
export function createApp({ config, services = {}, logger = undefined, readiness = async () => ({ postgres: false, vector: false }) }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use(requestContext, helmet(), requestRateLimit(), cookieParser());
    if (logger)
        app.use(pinoHttp({ logger, genReqId: (_req, res) => String(res.getHeader('x-request-id') ?? ''), serializers: { req: req => ({ method: req.method, url: String(req.url).split('?')[0] }), res: res => ({ statusCode: res.statusCode }) } }));
    app.use('/health', healthRoutes(readiness));
    app.use('/api/ui/v1', uiRoutes({ config, services }));
    app.use(notFound, errorHandler);
    return app;
}
