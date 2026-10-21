import express, { Router } from 'express';
import { createSessionStore, DEFAULT_UPLOAD_LIMITS, UploadQuarantine } from '@asi/gateway/ui';
import { sessionController } from '../controllers/session.controller.js';
import { requireSession } from '../middlewares/session.js';
import { originCsrf } from '../middlewares/origin-csrf.js';
import { readCapabilities } from '../services/capabilities.service.js';
import { conversationRoutes } from './conversation.routes.js';
import { domainRoutes } from './domain.routes.js';
export function uiRoutes({ config, services }) {
    const router = Router(), sessions = services.sessions ?? createSessionStore(), limits = services.limits ?? DEFAULT_UPLOAD_LIMITS;
    const quarantine = new UploadQuarantine(services.uploads ?? { scan: async () => ({ status: 'unavailable' }), discard: async () => { } }, limits, Date.now);
    const options = { ...services, config, services, sessions, limits, quarantine };
    const session = sessionController(options);
    router.post('/auth/session', express.json({ limit: '16kb' }), session.create);
    router.use(requireSession(sessions), originCsrf(config));
    router.delete('/auth/session', session.remove);
    // Raw bytes must be parsed before JSON and never inferred from a file MIME type.
    router.put('/uploads/:id/content', express.raw({ type: () => true, limit: limits.maxAttachmentBytes }));
    router.use(express.json({ limit: limits.maxMessageBytes }));
    router.get('/me', session.me);
    router.get('/capabilities', async (_req, res) => { res.set('cache-control', 'no-store'); res.json(await readCapabilities(services.capabilities)); });
    router.use('/conversations', conversationRoutes(options));
    router.use(domainRoutes(options));
    return router;
}
