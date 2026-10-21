import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createMemoryController(memoryService) {
    return {
        listOwnedFamilies(_req, res) {
            res.json({ service: 'memory', families: memoryService.ownedFamilies });
        },
        async invokeFamilyMethod(req, res) {
            const { family, method } = req.params;
            const model = memoryService.getModel(family);
            if (!model || typeof model[method] !== 'function') {
                throw apiError('NOT_FOUND', `Unknown Memory model family '${family}' or method '${method}'.`, 404);
            }
            const args = Array.isArray(req.body?.args) ? req.body.args : (req.body !== undefined && Object.keys(req.body).length > 0 ? [req.body] : []);
            const result = await model[method](...args, ctxOf(res));
            res.json({ family, method, result });
        },
        async vectorSearch(req, res) {
            try {
                const rows = await memoryService.searchVectors(req.body, ctxOf(res));
                res.json({ items: rows });
            } catch (err) {
                throw apiError('INVALID_INPUT', err.message, 400);
            }
        },
    };
}
