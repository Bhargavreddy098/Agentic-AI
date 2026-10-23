// @ts-check
import express from 'express';
import { z } from 'zod';
import { apiError } from '../../middlewares/error-handler.js';
import { LOCAL_SESSION_COOKIE } from './identity.routes.js';
import { parse, page, sendResponse, uuid } from './validation.js';
import { policyRulesSchema } from '../modules/governance/policy.js';

const digest = z.string().regex(/^[0-9a-f]{64}$/);
const reason = z.string().trim().min(1).max(2048);
const createPolicy = z.object({ baseRevisionId: uuid.optional(), rules: policyRulesSchema, reason }).strict();
const activatePolicy = z.object({ digest }).strict();
const createGrant = z.object({
    capability: z.string().regex(/^[a-z][a-z0-9_.:-]{2,127}$/),
    resourceScope: z.record(z.string(), z.unknown()),
    expiresAt: z.string().datetime(),
    contractRevisionId: uuid.optional(),
}).strict();
const revoke = z.object({ reason }).strict();
const requestApproval = z.object({ digest }).strict();
const decide = z.object({ decision: z.enum(['approve', 'reject']), nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/), digest, reason: reason.optional() }).strict();
const createBudget = z.object({ scopeKind: z.enum(['project', 'run']), runId: uuid.optional(), limitMicroUsd: z.string().regex(/^\d{1,19}$/), reason }).strict();
const updateBudget = z.object({ limitMicroUsd: z.string().regex(/^\d{1,19}$/), reason }).strict();

export function governanceRoutes({ identity, policies, grants, approvals, budgets }) {
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
    const require = service => {
        if (!service) throw apiError('CAPABILITY_UNAVAILABLE', 'Governance services are not configured.', 503);
        return service;
    };
    const id = name => req => parse(uuid, req.params[name]);
    const key = req => req.get('idempotency-key');
    const projectId = req => parse(uuid, req.params.projectId);
    const list = (res, result) => res.json({ data: result.data, meta: { requestId: res.locals.requestId, ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}) } });

    router.get('/policies/current', async (req, res) => {
        res.json({ data: await require(policies).current(res.locals.scope), meta: { requestId: res.locals.requestId } });
    });
    router.post('/policies/revisions', async (req, res) => {
        sendResponse(res, await require(policies).createRevision(res.locals.scope, key(req), parse(createPolicy, req.body)));
    });
    router.post('/policies/:revisionId/activate', async (req, res) => {
        sendResponse(res, await require(policies).activate(res.locals.scope, id('revisionId')(req), key(req), parse(activatePolicy, req.body)));
    });

    router.get('/projects/:projectId/grants', async (req, res) => {
        list(res, await require(grants).list(res.locals.scope, projectId(req), page(req.query)));
    });
    router.post('/projects/:projectId/grants', async (req, res) => {
        sendResponse(res, await require(grants).create(res.locals.scope, projectId(req), key(req), parse(createGrant, req.body)));
    });
    router.post('/grants/:grantId/revoke', async (req, res) => {
        sendResponse(res, await require(grants).revoke(res.locals.scope, id('grantId')(req), key(req), parse(revoke, req.body)));
    });

    router.post('/contract-revisions/:revisionId/approval-requests', async (req, res) => {
        sendResponse(res, await require(approvals).requestContract(res.locals.scope, id('revisionId')(req), key(req), parse(requestApproval, req.body)));
    });
    router.get('/approvals', async (req, res) => {
        const query = page(req.query, { projectId: uuid.optional(), state: z.enum(['pending', 'approved', 'rejected', 'expired', 'revoked', 'consumed']).optional() });
        list(res, await require(approvals).list(res.locals.scope, query));
    });
    router.get('/approvals/:approvalId', async (req, res) => {
        res.json({ data: await require(approvals).get(res.locals.scope, id('approvalId')(req)), meta: { requestId: res.locals.requestId } });
    });
    router.post('/approvals/:approvalId/decisions', async (req, res) => {
        sendResponse(res, await require(approvals).decide(res.locals.scope, id('approvalId')(req), key(req), parse(decide, req.body)));
    });
    router.post('/approvals/:approvalId/revoke', async (req, res) => {
        sendResponse(res, await require(approvals).revoke(res.locals.scope, id('approvalId')(req), key(req), parse(revoke, req.body)));
    });

    router.get('/usage', async (req, res) => {
        const query = page(req.query, {
            projectId: uuid.optional(),
            runId: uuid.optional(),
            category: z.string().trim().min(1).max(64).optional(),
            from: z.string().datetime().optional(),
            to: z.string().datetime().optional(),
        });
        list(res, await require(budgets).usage(res.locals.scope, query));
    });
    router.get('/projects/:projectId/budgets', async (req, res) => {
        res.json({ data: (await require(budgets).list(res.locals.scope, projectId(req))).data, meta: { requestId: res.locals.requestId } });
    });
    router.post('/projects/:projectId/budgets', async (req, res) => {
        sendResponse(res, await require(budgets).create(res.locals.scope, projectId(req), key(req), parse(createBudget, req.body)));
    });
    router.patch('/budgets/:budgetId', async (req, res) => {
        const match = req.get('if-match');
        if (!match) throw apiError('PRECONDITION_REQUIRED', 'If-Match is required.', 428);
        if (!/^"[1-9]\d*"$/.test(match)) throw apiError('INVALID_INPUT', 'Invalid If-Match version.');
        sendResponse(res, await require(budgets).update(res.locals.scope, id('budgetId')(req), key(req), match.slice(1, -1), parse(updateBudget, req.body)));
    });
    return router;
}
