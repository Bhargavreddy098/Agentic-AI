import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createOrchestratorController(orchestratorService) {
    return {
        listOwnedFamilies(_req, res) {
            res.json({ service: 'orchestrator', families: orchestratorService.ownedFamilies });
        },
        async selectSkills(req, res) {
            res.json(await orchestratorService.selectSkills(req.body, ctxOf(res)));
        },
        async deriveRecovery(req, res) {
            res.json(await orchestratorService.deriveRecovery(req.body, ctxOf(res)));
        },
        async compileContext(req, res) {
            res.json(await orchestratorService.compileContext(req.body, ctxOf(res)));
        },
        async labelInput(req, res) {
            res.json(await orchestratorService.labelInput(req.body, ctxOf(res)));
        },
        async invokeFamilyMethod(req, res) {
            const { family, method } = req.params;
            const model = orchestratorService.getModel(family);
            if (!model || typeof model[method] !== 'function') {
                throw apiError('NOT_FOUND', `Unknown Orchestrator model family '${family}' or method '${method}'.`, 404);
            }
            const args = Array.isArray(req.body?.args) ? req.body.args : (req.body !== undefined && Object.keys(req.body).length > 0 ? [req.body] : []);
            const result = await model[method](...args, ctxOf(res));
            res.json({ family, method, result });
        },
    };
}
