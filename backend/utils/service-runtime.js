import { createServer } from 'node:http';
import express, { Router } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import { requestContext } from '../middlewares/request-context.js';
import { requestRateLimit } from '../middlewares/rate-limit.js';
import { notFound } from '../middlewares/not-found.js';
import { apiError } from '../middlewares/error-handler.js';
import { computeDigest, ModelDomainError } from '../models/_shared.js';

export const SERVICE_PORTS = {
    'api-gateway': 4400,
    'core': 4410,
    'memory': 4420,
    'episode': 4430,
    'inference': 4440,
    'orchestrator': 4450,
    'tool-runtime': 4460,
    'specialist': 4470,
};

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} serviceName
 * @param {{requiresPostgres?: boolean, requiresSqlite?: boolean}} [opts]
 */
export function loadServiceConfig(env = process.env, serviceName = 'core', opts = {}) {
    const defaultPort = SERVICE_PORTS[serviceName] ?? 4410;
    const Schema = z.object({
        PORT: z.coerce.number().int().min(0).max(65535).default(defaultPort),
        HOST: z.enum(['127.0.0.1', '::1']).default('127.0.0.1'),
        SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
        ASI_SERVICE_TOKEN: z.string().min(8).max(256).default('asi-local-service-token-2026'),
        DATABASE_URL: opts.requiresPostgres
            ? z.string().url().refine(v => /^postgres(?:ql)?:/.test(v)).default(`postgresql://127.0.0.1:5432/asi_${serviceName.replace('-', '_')}`)
            : z.string().optional(),
        SQLITE_EPISODE_PATH: opts.requiresSqlite
            ? z.string().min(1).max(512).default(':memory:')
            : z.string().optional(),
        CORE_SERVICE_URL: z.string().url().default('http://127.0.0.1:4410'),
        MEMORY_SERVICE_URL: z.string().url().default('http://127.0.0.1:4420'),
        EPISODE_SERVICE_URL: z.string().url().default('http://127.0.0.1:4430'),
        INFERENCE_SERVICE_URL: z.string().url().default('http://127.0.0.1:4440'),
        ORCHESTRATOR_SERVICE_URL: z.string().url().default('http://127.0.0.1:4450'),
        TOOL_RUNTIME_SERVICE_URL: z.string().url().default('http://127.0.0.1:4460'),
        SPECIALIST_SERVICE_URL: z.string().url().default('http://127.0.0.1:4470'),
        ASI_ALLOWED_ORIGINS: z.string().default('http://127.0.0.1:3200,http://127.0.0.1:3000,http://127.0.0.1:3100'),
    });

    const parsed = Schema.safeParse(env);
    if (!parsed.success) {
        throw new Error(`Invalid ${serviceName} configuration: ` + parsed.error.issues.map(i => i.path.join('.')).join(', '));
    }
    const allowedOrigins = parsed.data.ASI_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
    return { ...parsed.data, serviceName, allowedOrigins };
}

export function requireInternalAuth(expectedAudience, expectedToken = 'asi-local-service-token-2026') {
    return (req, res, next) => {
        const callerService = String(req.headers['x-asi-service-id'] ?? '');
        const audience = String(req.headers['x-asi-audience'] ?? '');
        const version = String(req.headers['x-asi-contract-version'] ?? '1');
        const token = String(req.headers['x-asi-service-token'] ?? '');
        const tenantId = String(req.headers['x-asi-tenant-id'] ?? '');

        if (!callerService || !tenantId) {
            return next(apiError('UNAUTHORIZED', 'Authenticated service identity and tenantId are required.', 401));
        }
        if (version !== '1') {
            return next(apiError('INVALID_INPUT', `Unsupported internal contract version '${version}'.`, 400));
        }
        if (expectedAudience && audience && audience !== expectedAudience) {
            return next(apiError('FORBIDDEN', `Invalid target service audience '${audience}'; expected '${expectedAudience}'.`, 403));
        }
        if (expectedToken && token && token !== expectedToken) {
            return next(apiError('UNAUTHORIZED', 'Invalid internal service token.', 401));
        }

        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.headers['x-asi-payload-digest'] && req.body && typeof req.body === 'object') {
            const actualDigest = computeDigest(req.body);
            if (req.headers['x-asi-payload-digest'] !== actualDigest) {
                return next(apiError('CONFLICT', 'Request payload digest does not match x-asi-payload-digest header.', 409));
            }
        }

        const roleIdsHeader = String(req.headers['x-asi-role-ids'] ?? '');
        const scopesHeader = String(req.headers['x-asi-scopes'] ?? 'Global');
        res.locals.tenantContext = {
            tenantId,
            principalId: String(req.headers['x-asi-principal-id'] ?? 'principal-internal'),
            agentId: req.headers['x-asi-agent-id'] ? String(req.headers['x-asi-agent-id']) : null,
            roleIds: roleIdsHeader ? roleIdsHeader.split(',').map(s => s.trim()).filter(Boolean) : [],
            requestedScopes: scopesHeader.split(',').map(s => s.trim()).filter(Boolean),
            commandId: req.headers['x-asi-command-id'] ? String(req.headers['x-asi-command-id']) : undefined,
            now: req.headers['x-asi-now'] ? String(req.headers['x-asi-now']) : undefined,
        };
        next();
    };
}

export function serviceErrorHandler(error, _req, res, _next) {
    void _next;
    const requestId = String(res.getHeader('x-request-id') ?? '');
    if (error instanceof ModelDomainError) {
        res.status(error.status || 400).json({
            error: {
                code: error.code,
                message: error.message,
                requestId,
                retryable: error.status === 503,
            },
        });
        return;
    }
    const status = Number.isInteger(error?.status) ? error.status : (error?.type === 'entity.too.large' ? 413 : 500);
    const code = typeof error?.code === 'string' && !error.code.startsWith('ERR_')
        ? error.code
        : (status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INTERNAL_ERROR');
    const message = status >= 500 && status !== 503 ? 'Request failed.' : (error?.message || 'Request failed.');
    res.status(status).json({
        error: {
            code,
            message,
            requestId,
            retryable: status === 503,
        },
    });
}

export function createServiceHealthRoutes(serviceName, readiness = async () => ({ ready: true })) {
    const router = Router();
    router.get('/live', (_req, res) => {
        res.set('cache-control', 'no-store');
        res.json({ status: 'ok', service: serviceName });
    });
    router.get('/ready', async (_req, res) => {
        res.set('cache-control', 'no-store');
        try {
            const checks = await readiness();
            const ok = Object.values(checks).every(v => v === true);
            res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'unavailable', service: serviceName, checks });
        } catch {
            res.status(503).json({ status: 'unavailable', service: serviceName, checks: { ready: false } });
        }
    });
    return router;
}

/**
 * @param {any} options
 */
export function createServiceApp({ serviceName, config, internalRouter, publicRouter = null, readiness, logger }) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', false);
    app.use(requestContext, helmet(), requestRateLimit(), cookieParser());
    if (logger) {
        app.use(pinoHttp({
            logger,
            genReqId: (_req, res) => String(res.getHeader('x-request-id') ?? ''),
            serializers: {
                req: req => ({ method: req.method, url: String(req.url).split('?')[0] }),
                res: res => ({ statusCode: res.statusCode }),
            },
        }));
    }
    app.use('/health', createServiceHealthRoutes(serviceName, readiness));
    if (publicRouter) {
        app.use('/api/ui/v1', publicRouter);
    }
    if (internalRouter) {
        app.use('/internal/v1', express.json({ limit: '256kb' }), requireInternalAuth(serviceName, config?.ASI_SERVICE_TOKEN), internalRouter);
    }
    app.use(notFound, serviceErrorHandler);
    return app;
}

export async function startServiceServer({ app, config, resources = [] }) {
    const server = createServer(app);
    let closing;
    await new Promise((done, fail) => {
        server.once('error', fail);
        server.listen(config.PORT, config.HOST, () => {
            server.off('error', fail);
            done(undefined);
        });
    });
    const close = () => closing ??= (async () => {
        const timer = setTimeout(() => server.closeAllConnections(), config.SHUTDOWN_TIMEOUT_MS ?? 5000);
        timer.unref();
        try {
            await new Promise((done, fail) => server.close(err => err ? fail(err) : done(undefined)));
            await Promise.all(resources.map(r => r.close()));
        } finally {
            clearTimeout(timer);
        }
    })();
    return { server, address: server.address(), close };
}
