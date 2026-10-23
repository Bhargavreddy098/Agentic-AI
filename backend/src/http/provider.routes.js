// @ts-check
import express from 'express';
import { z } from 'zod';
import { apiError } from '../../middlewares/error-handler.js';
import { LOCAL_SESSION_COOKIE } from './identity.routes.js';
import { parse, page, sendResponse, uuid } from './validation.js';
import { providerInputSchemas } from './provider.schemas.js';

const { CreateProvider: createProvider, PatchProvider: patchProvider, Discovery: discovery, RoutingPreview: routingPreview } = providerInputSchemas;

export function providerRoutes({ identity, providers }) {
    const router = express.Router();
    router.use(async (req, res, next) => {
        if (!res.locals.scope) {
            const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
            if (mutating && !req.get('x-csrf-token')) throw apiError('CSRF_FAILED', 'CSRF token is required.', 403);
            if (!identity) throw apiError('CAPABILITY_UNAVAILABLE', 'Local identity is unavailable.', 503);
            const scope = await identity.authenticate(req.cookies?.[LOCAL_SESSION_COOKIE], mutating ? req.get('x-csrf-token') : undefined);
            res.locals.scope = { ...scope, requestId: res.locals.requestId };
        }
        next();
    });
    router.use(express.json({ limit: '256kb' }));
    const require = () => {
        if (!providers) throw apiError('CAPABILITY_UNAVAILABLE', 'Provider services are not configured.', 503);
        return providers;
    };
    const id = name => req => parse(uuid, req.params[name]);
    const key = req => parse(z.string().regex(/^[\x21-\x7e]{1,128}$/), req.get('idempotency-key'));
    const list = (res, result) => res.json({ data: result.data, meta: { requestId: res.locals.requestId, ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}) } });

    router.post('/providers', async (req, res) => {
        const response = await require().create(res.locals.scope, key(req), parse(createProvider, req.body));
        sendResponse(res, response, '/api/v1/providers/' + response.data.id);
    });
    router.get('/providers', async (req, res) => list(res, await require().list(res.locals.scope, page(req.query))));
    router.get('/providers/:providerId', async (req, res) => {
        res.json({ data: await require().get(res.locals.scope, id('providerId')(req)), meta: { requestId: res.locals.requestId } });
    });
    router.patch('/providers/:providerId', async (req, res) => {
        const match = req.get('if-match');
        if (!match) throw apiError('PRECONDITION_REQUIRED', 'If-Match is required.', 428);
        if (!/^"[1-9]\d*"$/.test(match)) throw apiError('INVALID_INPUT', 'Invalid If-Match version.');
        sendResponse(res, await require().update(res.locals.scope, id('providerId')(req), key(req), match.slice(1, -1), parse(patchProvider, req.body)));
    });
    router.post('/providers/:providerId/discovery', async (req, res) => {
        const input = parse(discovery, req.body);
        if (input.probe && !input.budgetCeilingMicroUsd) throw apiError('BUDGET_REQUIRED', 'A budget ceiling is required for a paid capability probe.', 409);
        const response = await require().discover(res.locals.scope, id('providerId')(req), key(req), input);
        sendResponse(res, response, '/api/v1/operations/' + response.data.id);
    });
    router.get('/models', async (req, res) => {
        const query = page(req.query, {
            providerId: uuid.optional(),
            capability: z.string().regex(/^[a-z][a-z0-9_.:-]{2,127}$/).optional(),
        });
        list(res, await require().models(res.locals.scope, query));
    });
    router.post('/routing/preview', async (req, res) => {
        sendResponse(res, await require().routingPreview(res.locals.scope, parse(routingPreview, req.body), key(req)));
    });
    return router;
}
