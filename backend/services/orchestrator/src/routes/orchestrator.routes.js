import { Router } from 'express';
import { createOrchestratorController } from '../controllers/orchestrator.controller.js';

export function createOrchestratorRoutes(orchestratorService) {
    const router = Router();
    const c = createOrchestratorController(orchestratorService);

    router.get('/families', c.listOwnedFamilies);
    router.post('/skills/select', c.selectSkills);
    router.post('/recovery/derive', c.deriveRecovery);
    router.post('/context/compile', c.compileContext);
    router.post('/trust/label', c.labelInput);
    router.post('/models/:family/:method', c.invokeFamilyMethod);
    return router;
}
