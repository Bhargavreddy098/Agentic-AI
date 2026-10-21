import { Router } from 'express';
import { createCoreController } from '../controllers/core.controller.js';

export function createCoreRoutes(coreService) {
    const router = Router();
    const c = createCoreController(coreService);

    router.get('/families', c.listOwnedFamilies);
    router.post('/conversations', c.createConversation);
    router.get('/conversations', c.listConversations);
    router.get('/conversations/:id', c.getConversation);
    router.patch('/conversations/:id', c.reviseConversation);

    router.post('/goals', c.createGoal);
    router.get('/goals', c.listGoals);
    router.get('/goals/:id', c.getGoal);
    router.patch('/goals/:id', c.reviseGoal);

    router.post('/models/:family/:method', c.invokeFamilyMethod);
    return router;
}
