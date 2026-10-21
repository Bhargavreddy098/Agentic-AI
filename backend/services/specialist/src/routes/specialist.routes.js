import { Router } from 'express';
import { createSpecialistController } from '../controllers/specialist.controller.js';

export function createSpecialistRoutes(specialistService) {
    const router = Router();
    const c = createSpecialistController(specialistService);

    router.get('/families', c.listOwnedFamilies);
    router.post('/workers/scores', c.recordScore);
    router.get('/workers/:workerId/score', c.getScore);
    router.post('/workers/rank', c.rankWorkers);
    router.post('/models/:family/:method', c.invokeFamilyMethod);
    return router;
}
