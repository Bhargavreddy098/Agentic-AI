import { apiError } from '../../../../middlewares/error-handler.js';

const ctxOf = res => res.locals.tenantContext;

export function createToolRuntimeController(toolRuntimeService) {
    return {
        async registerManifest(req, res) {
            const out = await toolRuntimeService.registerManifest(req.body, ctxOf(res));
            res.status(out.status === 'created' ? 201 : 200).json(out);
        },
        async listManifests(_req, res) {
            res.json({ items: await toolRuntimeService.listManifests(ctxOf(res)) });
        },
        async executeTool(req, res) {
            res.json(await toolRuntimeService.executeTool(req.body, ctxOf(res)));
        },
        async getExecutionStatus(req, res) {
            const record = await toolRuntimeService.getExecutionStatus(req.params.id, ctxOf(res));
            if (!record) throw apiError('NOT_FOUND', 'Tool execution record not found.', 404);
            res.json(record);
        },
    };
}
