// @ts-check
import express from 'express';
import { z } from 'zod';
import { apiError } from '../../middlewares/error-handler.js';
import { LOCAL_SESSION_COOKIE } from './identity.routes.js';
import { parse, page, uuid } from './validation.js';
import { contentRoutes } from './content.routes.js';

const createProject = z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(['greenfield', 'existing']), workspaceRootRef: uuid.optional(), repositoryConnectionId: uuid.optional() }).strict();
const patchProject = z.object({ name: z.string().trim().min(1).max(200).optional(), description: z.string().max(8192).optional() }).strict().refine(value => Object.keys(value).length > 0);

export function productRoutes({ identity, projects, conversations, artifacts, uploads, operations }) {
    const router = express.Router();
    const owner = () => { if (!identity || !projects) throw apiError('CAPABILITY_UNAVAILABLE', 'Product services are not configured.', 503); return projects; };
    router.use(async (req, res, next) => {
        const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (mutating && !req.get('x-csrf-token')) throw apiError('CSRF_FAILED', 'CSRF token is required.', 403);
        if (!identity) throw apiError('CAPABILITY_UNAVAILABLE', 'Local identity is unavailable.', 503);
        const scope = await identity.authenticate(req.cookies?.[LOCAL_SESSION_COOKIE], mutating ? req.get('x-csrf-token') : undefined);
        res.locals.scope = { ...scope, requestId: res.locals.requestId };
        next();
    });
    router.put('/uploads/:uploadId/content', express.raw({ type: () => true, limit: '16mb' }), async (req, res) => {
        if (!uploads) throw apiError('CAPABILITY_UNAVAILABLE', 'Uploads are not configured.', 503);
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
        res.json({ data: await uploads.write(res.locals.scope, parse(uuid, req.params.uploadId), bytes), meta: { requestId: res.locals.requestId } });
    });
    router.use(express.json({ limit: '256kb' }));
    router.use(contentRoutes({ conversations, artifacts, uploads, operations }));
    const id = req => parse(uuid, req.params.projectId);
    const send = (res, response) => {
        if (response.data.version) res.set('etag', '"' + response.data.version + '"');
        if (response.status === 201) res.set('location', '/api/v1/projects/' + response.data.id);
        res.status(response.status).json({ data: response.data, meta: { requestId: res.locals.requestId, ...(response.data.version ? { version: response.data.version } : {}) } });
    };
    router.post('/projects', async (req, res) => send(res, await owner().create(res.locals.scope, req.get('idempotency-key'), parse(createProject, req.body))));
    router.get('/projects', async (req, res) => {
        const result = await owner().list(res.locals.scope, page(req.query, { status: z.enum(['active', 'archived']).optional() }));
        res.json({ data: result.data, meta: { requestId: res.locals.requestId, nextCursor: result.nextCursor } });
    });
    router.get('/projects/:projectId', async (req, res) => send(res, { status: 200, data: await owner().read(res.locals.scope, id(req)) }));
    router.patch('/projects/:projectId', async (req, res) => {
        const match = req.get('if-match');
        if (!match) throw apiError('PRECONDITION_REQUIRED', 'If-Match is required.', 428);
        if (!/^"[1-9]\d*"$/.test(match)) throw apiError('INVALID_INPUT', 'Invalid If-Match version.');
        send(res, await owner().update(res.locals.scope, id(req), req.get('idempotency-key'), match.slice(1, -1), parse(patchProject, req.body)));
    });
    router.post('/projects/:projectId/archive', async (req, res) => send(res, await owner().archive(res.locals.scope, id(req), req.get('idempotency-key'), parse(z.object({ reason: z.string().trim().min(1).max(2048) }).strict(), req.body))));
    return router;
}
