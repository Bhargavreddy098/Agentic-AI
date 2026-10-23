// @ts-check
import express from 'express';
import { z } from 'zod';
import { apiError } from '../../middlewares/error-handler.js';

const bootstrapInput = z.object({ challenge: z.string().length(43), clientNonce: z.string().length(43) }).strict();
export const LOCAL_SESSION_COOKIE = 'asi_local_session';

export function localIdentityRoutes({ identity, config }) {
    const router = express.Router();
    const unavailable = () => { if (!identity) throw apiError('CAPABILITY_UNAVAILABLE', 'Local identity is not configured.', 503); return identity; };
    const success = (res, data) => res.json({ data, meta: { requestId: res.locals.requestId } });
    router.use((req, res, next) => {
        res.set('cache-control', 'no-store');
        const host = req.get('host') ?? '';
        if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/.test(host)) return next(apiError('POLICY_DENIED', 'Host is not allowed.', 403));
        const origin = req.get('origin');
        if ((origin !== undefined || !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) && !config.allowedOrigins.includes(origin)) {
            return next(apiError('POLICY_DENIED', 'Origin is not allowed.', 403));
        }
        if (origin !== undefined) {
            res.set('access-control-allow-origin', origin);
            res.set('access-control-allow-credentials', 'true');
            res.vary('Origin');
        }
        if (req.method === 'OPTIONS') {
            const path = req.path.toLowerCase().replace(/\/$/, '');
            let methods = { '/session/bootstrap': ['POST'], '/session': ['GET', 'HEAD', 'DELETE'], '/workspaces': ['GET', 'HEAD'], '/capabilities': ['GET', 'HEAD'],
                '/providers': ['GET', 'HEAD', 'POST'], '/models': ['GET', 'HEAD'], '/routing/preview': ['POST'] }[path];
            if (/^\/providers\/[a-f0-9-]{36}$/.test(path)) methods = ['GET', 'HEAD', 'PATCH'];
            if (/^\/providers\/[a-f0-9-]{36}\/discovery$/.test(path)) methods = ['POST'];
            const method = req.get('access-control-request-method');
            const headers = (req.get('access-control-request-headers') ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
            if (!origin || !methods?.includes(method) || headers.some(header => !['content-type', 'x-csrf-token', 'idempotency-key', 'if-match'].includes(header))) {
                return next(apiError('POLICY_DENIED', 'Preflight is not allowed.', 403));
            }
            res.vary('Access-Control-Request-Method');
            res.vary('Access-Control-Request-Headers');
            res.set('access-control-allow-methods', methods.join(', '));
            res.set('access-control-allow-headers', 'content-type, x-csrf-token, idempotency-key, if-match');
            return res.status(204).end();
        }
        next();
    });
    router.post('/session/bootstrap', express.json({ limit: '16kb' }), async (req, res) => {
        const parsed = bootstrapInput.safeParse(req.body);
        if (!parsed.success) throw apiError('INVALID_INPUT', 'Expected a launcher challenge and client nonce.');
        const result = await unavailable().bootstrap({ ...parsed.data, previousToken: req.cookies?.[LOCAL_SESSION_COOKIE] });
        res.cookie(LOCAL_SESSION_COOKIE, result.token, { httpOnly: true, sameSite: 'strict', secure: config.secureCookies ?? false, path: '/api/v1' });
        success(res, result.data);
    });
    const authenticateOwner = async (req, res, next) => {
        res.locals.identity = await unavailable().authenticate(req.cookies?.[LOCAL_SESSION_COOKIE]);
        next();
    };
    router.get('/session', authenticateOwner, async (req, res) => success(res, await unavailable().current(req.cookies?.[LOCAL_SESSION_COOKIE])));
    router.delete('/session', async (req, res) => {
        await unavailable().revoke(req.cookies?.[LOCAL_SESSION_COOKIE], req.get('x-csrf-token'), req.get('idempotency-key'));
        res.clearCookie(LOCAL_SESSION_COOKIE, { path: '/api/v1' });
        res.status(204).end();
    });
    router.get('/workspaces', authenticateOwner, async (req, res) => {
        const page = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().min(1).max(128).optional() }).strict().safeParse(req.query);
        if (!page.success) throw apiError('INVALID_INPUT', 'Invalid workspace pagination.');
        const after = page.data.cursor ? Buffer.from(page.data.cursor, 'base64url').toString() : null;
        if (after && (!z.string().uuid().safeParse(after).success || Buffer.from(after).toString('base64url') !== page.data.cursor)) {
            throw apiError('INVALID_INPUT', 'Invalid workspace cursor.');
        }
        const result = await unavailable().workspaces(res.locals.identity.principalId, { limit: page.data.limit, after });
        res.json({ data: result.data, meta: { requestId: res.locals.requestId, nextCursor: result.nextCursor } });
    });
    router.get('/capabilities', authenticateOwner, (_req, res) => success(res, { items: [
        { name: 'identity.sessions', state: 'available' },
        { name: 'projects', state: 'available' },
        { name: 'governance', state: 'available' },
        { name: 'providers', state: 'available' },
        ...['planning', 'execution', 'verification', 'memory', 'schedules', 'deployment'].map(name => ({ name, state: 'disabled', reason: 'ROADMAP_STAGE_NOT_QUALIFIED' })),
    ] }));
    return router;
}
