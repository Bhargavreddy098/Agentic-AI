import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createSpecialistController(specialistService) {
    return {
        listOwnedFamilies(_req, res) {
            res.json({ service: 'specialist', families: specialistService.ownedFamilies });
        },
        async recordScore(req, res) {
            res.status(201).json(await specialistService.recordWorkerScore(req.body, ctxOf(res)));
        },
        async getScore(req, res) {
            const record = await specialistService.getWorkerScore(req.params.workerId, ctxOf(res));
            if (!record) throw apiError('NOT_FOUND', 'Worker score not found.', 404);
            res.json(record);
        },
        async rankWorkers(req, res) {
            const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : undefined;
            res.json({ rankings: await specialistService.rankEligibleWorkers(candidates, ctxOf(res)) });
        },
        async invokeFamilyMethod(req, res) {
            const { family, method } = req.params;
            const model = specialistService.getModel(family);
            if (!model || typeof model[method] !== 'function') {
                throw apiError('NOT_FOUND', `Unknown Specialist model family '${family}' or method '${method}'.`, 404);
            }
            const args = Array.isArray(req.body?.args) ? req.body.args : (req.body !== undefined && Object.keys(req.body).length > 0 ? [req.body] : []);
            const result = await model[method](...args, ctxOf(res));
            res.json({ family, method, result });
        },
    };
}
