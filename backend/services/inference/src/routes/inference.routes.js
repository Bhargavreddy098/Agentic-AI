import { Router } from 'express';
import { createInferenceController } from '../controllers/inference.controller.js';

export function createInferenceRoutes(inferenceService) {
    const router = Router();
    const c = createInferenceController(inferenceService);

    router.get('/families', c.listOwnedFamilies);
    router.post('/route', c.routeModel);
    router.post('/generate', c.generate);
    router.post('/embed', c.embed);
    router.post('/usage/reconcile', c.reconcileUsage);
    router.post('/models/:family/:method', c.invokeFamilyMethod);
    return router;
}
