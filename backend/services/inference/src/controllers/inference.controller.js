import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createInferenceController(inferenceService) {
    return {
        listOwnedFamilies(_req, res) {
            res.json({ service: 'inference', families: inferenceService.ownedFamilies });
        },
        async routeModel(req, res) {
            res.json(await inferenceService.routeModel(req.body, ctxOf(res)));
        },
        async generate(req, res) {
            res.json(await inferenceService.generate(req.body, ctxOf(res)));
        },
        async embed(req, res) {
            res.json(await inferenceService.embed(req.body, ctxOf(res)));
        },
        async reconcileUsage(req, res) {
            res.json(await inferenceService.reconcileUsage(req.body, ctxOf(res)));
        },
        async invokeFamilyMethod(req, res) {
            const { family, method } = req.params;
            const model = inferenceService.getModel(family);
            if (!model || typeof model[method] !== 'function') {
                throw apiError('NOT_FOUND', `Unknown Inference model family '${family}' or method '${method}'.`, 404);
            }
            const args = Array.isArray(req.body?.args) ? req.body.args : (req.body !== undefined && Object.keys(req.body).length > 0 ? [req.body] : []);
            const result = await model[method](...args, ctxOf(res));
            res.json({ family, method, result });
        },
    };
}
