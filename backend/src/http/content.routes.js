// @ts-check
import { Router } from 'express';
import { z } from 'zod';
import { parse, page, uuid, sendResponse } from './validation.js';
import { apiError } from '../../middlewares/error-handler.js';

export function contentRoutes({ conversations, artifacts, uploads, operations }) {
    const router = Router();
    const owner = port => { if (!port) throw apiError('CAPABILITY_UNAVAILABLE', 'Content service is not configured.', 503); return port; };
    const list = (res, result) => res.json({ data: result.data, meta: { requestId: res.locals.requestId, nextCursor: result.nextCursor } });
    router.post('/projects/:projectId/conversations', async (req, res) => {
        const projectId = parse(uuid, req.params.projectId);
        const input = parse(z.object({ title: z.string().trim().min(1).max(200).optional() }).strict(), req.body);
        const response = await owner(conversations).create(res.locals.scope, projectId, req.get('idempotency-key'), input);
        sendResponse(res, response, '/api/v1/conversations/' + response.data.id);
    });
    router.get('/projects/:projectId/conversations', async (req, res) => list(res, await owner(conversations).list(res.locals.scope, parse(uuid, req.params.projectId), page(req.query))));
    router.get('/conversations/:conversationId', async (req, res) => sendResponse(res, { status: 200, data: await owner(conversations).read(res.locals.scope, parse(uuid, req.params.conversationId)) }));
    router.post('/conversations/:conversationId/messages', async (req, res) => {
        const input = parse(z.object({ text: z.string().min(1).max(32000), attachmentIds: z.array(uuid).max(10).default([]).refine(ids => new Set(ids).size === ids.length).transform(ids => ids.sort()) }).strict(), req.body);
        const response = await owner(conversations).append(res.locals.scope, parse(uuid, req.params.conversationId), req.get('idempotency-key'), input);
        sendResponse(res, response);
    });
    router.get('/conversations/:conversationId/messages', async (req, res) => list(res, await owner(conversations).messages(res.locals.scope, parse(uuid, req.params.conversationId), page(req.query, {}, true))));
    router.get('/projects/:projectId/artifacts', async (req, res) => list(res, await owner(artifacts).list(res.locals.scope, parse(uuid, req.params.projectId), page(req.query))));
    router.get('/artifacts/:artifactId', async (req, res) => {
        const artifact = await owner(artifacts).read(res.locals.scope, parse(uuid, req.params.artifactId));
        if (artifact.status === 'quarantined') throw apiError('QUARANTINED', 'Artifact is quarantined.', 409);
        sendResponse(res, { status: 200, data: artifact });
    });
    router.get('/artifacts/:artifactId/content', async (req, res) => {
        if (req.get('range')) throw apiError('INVALID_RANGE', 'Range requests are not supported.', 416);
        const { artifact, bytes } = await owner(artifacts).download(res.locals.scope, parse(uuid, req.params.artifactId));
        res.set('content-type', 'application/octet-stream');
        res.set('content-disposition', 'attachment; filename="' + artifact.id + '.bin"');
        res.set('etag', '"' + artifact.digest + '"');
        res.set('content-digest', 'sha-256=:' + Buffer.from(artifact.digest, 'hex').toString('base64') + ':');
        res.set('x-content-type-options', 'nosniff');
        res.send(bytes);
    });
    router.post('/projects/:projectId/uploads', async (req, res) => {
        const filename = z.string().min(1).max(255).refine(value => !/[\\/]/.test(value) && ![...value].some(char => char.charCodeAt(0) < 32) && !/[. ]$/.test(value)
            && !/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value) && value !== '.' && value !== '..');
        const input = parse(z.object({ filename, mediaType: z.string().regex(/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/).max(256),
            bytes: z.string().regex(/^(0|[1-9]\d{0,8})$/).refine(value => BigInt(value) <= 16777216n), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), req.body);
        const response = await owner(uploads).begin(res.locals.scope, parse(uuid, req.params.projectId), req.get('idempotency-key'), input);
        sendResponse(res, response);
    });
    router.post('/uploads/:uploadId/complete', async (req, res) => {
        const input = parse(z.object({ digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), req.body);
        const response = await owner(uploads).complete(res.locals.scope, parse(uuid, req.params.uploadId), req.get('idempotency-key'), input);
        sendResponse(res, response, '/api/v1/operations/' + response.data.id);
    });
    router.get('/operations/:operationId', async (req, res) => sendResponse(res, { status: 200, data: await owner(operations).read(res.locals.scope, parse(uuid, req.params.operationId)) }));
    return router;
}
