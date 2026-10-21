import { Router } from 'express';
import { createToolRuntimeController } from '../controllers/tool-runtime.controller.js';

export function createToolRuntimeRoutes(toolRuntimeService) {
    const router = Router();
    const c = createToolRuntimeController(toolRuntimeService);

    router.post('/manifests', c.registerManifest);
    router.get('/manifests', c.listManifests);
    router.post('/executions', c.executeTool);
    router.get('/executions/:id', c.getExecutionStatus);
    return router;
}
