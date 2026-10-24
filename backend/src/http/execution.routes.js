// @ts-check
import express from 'express';
import { z } from 'zod';
import { parse, page, uuid, sendResponse } from './validation.js';
import { apiError } from '../../middlewares/error-handler.js';
import { LOCAL_SESSION_COOKIE } from './identity.routes.js';
import { runStates, taskStates, effectStates } from '../modules/orchestration/contracts.js';
const decimal = z.string().regex(/^(0|[1-9]\d{0,18})$/).refine(s => BigInt(s) <= 9223372036854775807n);
const reason = z.object({ reason: z.string().trim().min(1).max(2048) }).strict();
/** Slow consumers reconnect from the last fully received durable event. */
export function writeEvent(response, encoded) {
    if (Buffer.byteLength(encoded) > 1048576 || response.writableLength > 1048576) {
        response.end();
        return false;
    }
    if (!response.write(encoded)) {
        response.end();
        return false;
    }
    return true;
}
export function executionRoutes({ identity, orchestration }) {
    const router = express.Router();
    const service = () => { if (!orchestration)
        throw apiError('CAPABILITY_UNAVAILABLE', 'Durable execution is unavailable.', 503); return orchestration; };
    router.get('/projects/:projectId/runs', async (req, res) => { const result = await service().list(res.locals.scope, parse(uuid, req.params.projectId), page(req.query, { state: z.enum(runStates).optional() })); res.json({ data: result.data, meta: { requestId: res.locals.requestId, nextCursor: result.nextCursor } }); });
    router.get('/runs/:runId', async (req, res) => { parse(z.object({}).strict(), req.query); const result = await service().read(res.locals.scope, parse(uuid, req.params.runId)); res.set('etag', '"' + result.data.version + '"'); res.json({ data: result.data, meta: { requestId: res.locals.requestId, version: result.data.version, currentSequence: result.currentSequence } }); });
    for (const kind of ['tasks', 'agents', 'effects', 'checkpoints'])
        router.get('/runs/:runId/' + kind, async (req, res) => { const extra = kind === 'tasks' ? { state: z.enum(taskStates).optional() } : kind === 'effects' ? { state: z.enum(effectStates).optional() } : {}; const result = await service().children(res.locals.scope, parse(uuid, req.params.runId), kind, page(req.query, extra)); res.json({ data: result.data, meta: { requestId: res.locals.requestId, nextCursor: result.nextCursor } }); });
    for (const action of ['pause', 'resume', 'cancel'])
        router.post('/runs/:runId/' + action, async (req, res) => { const input = parse(action === 'resume' ? z.object({ checkpointId: uuid, expectedEpoch: decimal }).strict() : reason, req.body); sendResponse(res, await service().control(res.locals.scope, parse(uuid, req.params.runId), action, req.get('idempotency-key'), input)); });
    router.post('/effects/:effectId/reconcile', async (req, res) => { const input = parse(z.object({ externalReceiptRef: uuid.optional(), reason: z.string().trim().min(1).max(2048) }).strict(), req.body); sendResponse(res, await service().requestReconciliation(res.locals.scope, parse(uuid, req.params.effectId), req.get('idempotency-key'), input)); });
    router.post('/goals/:goalId/runs', async (req) => { parse(uuid, req.params.goalId); parse(z.object({ contractRevisionId: uuid, contractDigest: z.string().regex(/^[a-f0-9]{64}$/), repositorySnapshotId: uuid, budgetCeilingMicroUsd: decimal }).strict(), req.body); throw apiError('ROADMAP_STAGE_NOT_QUALIFIED', 'Public execution start requires planning, isolation, tools, and verification gates (Stages 09–12).', 503); });
    router.get('/runs/:runId/events', async (req, res) => {
        const id = parse(uuid, req.params.runId);
        const query = parse(z.object({ after: decimal.optional() }).strict(), req.query);
        const header = req.get('last-event-id');
        if (header !== undefined && query.after !== undefined && header !== query.after)
            throw apiError('INVALID_INPUT', 'Conflicting event cursors.');
        let cursor = parse(decimal, header ?? query.after ?? '0');
        let rows = await service().events(res.locals.scope, id, cursor);
        res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
        res.flushHeaders();
        const detach = service().registerStream(res);
        let stopped = false;
        let timer;
        let lastHeartbeat = Date.now();
        let lastAuth = Date.now();
        const stop = () => { stopped = true; clearTimeout(timer); detach(); };
        res.once('close', stop);
        const pump = async () => {
            try {
                if (stopped)
                    return;
                if (Date.now() - lastAuth >= 1000) {
                    await identity.authenticate(req.cookies?.[LOCAL_SESSION_COOKIE]);
                    lastAuth = Date.now();
                }
                for (const event of rows) {
                    if (stopped)
                        return;
                    const encoded = `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
                    if (!writeEvent(res, encoded)) {
                        stop();
                        return;
                    }
                    cursor = event.sequence;
                }
                if (Date.now() - lastHeartbeat >= 15000) {
                    if (!res.write(': heartbeat\n\n')) {
                        res.end();
                        stop();
                        return;
                    }
                    lastHeartbeat = Date.now();
                }
                rows = await service().events(res.locals.scope, id, cursor);
                if (!stopped) {
                    timer = setTimeout(() => { void pump(); }, 1000);
                    timer.unref();
                }
            }
            catch {
                res.end();
                stop();
            }
        };
        void pump();
    });
    return router;
}
