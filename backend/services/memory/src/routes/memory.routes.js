import { Router } from 'express';
import { createMemoryController } from '../controllers/memory.controller.js';

export function createMemoryRoutes(memoryService) {
    const router = Router();
    const c = createMemoryController(memoryService);

    router.get('/families', c.listOwnedFamilies);
    router.post('/vectors/search', c.vectorSearch);
    router.post('/models/:family/:method', c.invokeFamilyMethod);
    return router;
}
