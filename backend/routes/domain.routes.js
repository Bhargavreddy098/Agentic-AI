import { Router } from 'express';
import { domainController } from '../controllers/domain.controller.js';
export function domainRoutes(options) {
    const router = Router(), c = domainController(options);
    router.post('/runs/:id/cancel', c.cancel);
    router.post('/clarifications/:id/answers', c.answer);
    router.post('/approvals/:id/decisions', c.approve);
    router.post('/commands', c.command);
    for (const kind of ['providers', 'models', 'skills', 'connections'])
        router.get('/' + kind, c.catalog(kind));
    router.get('/memory', c.memory);
    router.get('/activity', c.activity);
    router.get('/settings', c.settings);
    router.post('/uploads', c.uploadBegin);
    router.put('/uploads/:id/content', c.uploadWrite);
    router.post('/uploads/:id/complete', c.uploadComplete);
    router.get('/uploads/:id', c.uploadView);
    return router;
}
