import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createCoreController(coreService) {
    const convGoal = coreService.models['conversation-goal'];

    return {
        listOwnedFamilies(_req, res) {
            res.json({ service: 'core', families: coreService.ownedFamilies });
        },
        async createConversation(req, res) {
            const out = await convGoal.createOrGetConversation(req.body, ctxOf(res));
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async getConversation(req, res) {
            const record = await convGoal.getConversation(req.params.id, ctxOf(res));
            if (!record) throw apiError('NOT_FOUND', 'Conversation not found.', 404);
            res.json(record);
        },
        async reviseConversation(req, res) {
            const expectedRevision = Number(req.body?.expectedRevision ?? 1);
            const out = await convGoal.reviseConversation(req.params.id, req.body, expectedRevision, ctxOf(res));
            res.json(out);
        },
        async listConversations(req, res) {
            res.json(await convGoal.listConversations(req.query, ctxOf(res)));
        },
        async createGoal(req, res) {
            const out = await convGoal.createGoal(req.body, ctxOf(res));
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async getGoal(req, res) {
            const record = await convGoal.getGoal(req.params.id, ctxOf(res));
            if (!record) throw apiError('NOT_FOUND', 'Goal not found.', 404);
            res.json(record);
        },
        async reviseGoal(req, res) {
            const expectedRevision = Number(req.body?.expectedRevision ?? 1);
            const out = await convGoal.reviseGoal(req.params.id, req.body, expectedRevision, ctxOf(res));
            res.json(out);
        },
        async listGoals(req, res) {
            res.json(await convGoal.listGoals(req.query, ctxOf(res)));
        },
        async invokeFamilyMethod(req, res) {
            const { family, method } = req.params;
            const model = coreService.getModel(family);
            if (!model || typeof model[method] !== 'function') {
                throw apiError('NOT_FOUND', `Unknown Core model family '${family}' or method '${method}'.`, 404);
            }
            const args = Array.isArray(req.body?.args) ? req.body.args : (req.body !== undefined && Object.keys(req.body).length > 0 ? [req.body] : []);
            const result = await model[method](...args, ctxOf(res));
            res.json({ family, method, result });
        },
    };
}
