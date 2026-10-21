import { Router } from 'express';
import { createEpisodeController } from '../controllers/episode.controller.js';

export function createEpisodeRoutes(episodeService) {
    const router = Router();
    const c = createEpisodeController(episodeService);

    router.post('/episodes', c.append);
    router.get('/episodes', c.search);
    router.get('/sessions/:sessionId/replay', c.replay);
    router.post('/lineage', c.appendLineage);
    router.get('/lineage/:id', c.getLineage);
    return router;
}
