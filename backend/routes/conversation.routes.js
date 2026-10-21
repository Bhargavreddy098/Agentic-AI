import { Router } from 'express';
import { conversationController } from '../controllers/conversation.controller.js';
import { eventsController } from '../controllers/events.controller.js';
export function conversationRoutes(options) { const router = Router(), c = conversationController(options); router.get('/', c.list); router.post('/', c.create); router.patch('/:id', c.update); router.get('/:id/snapshot', c.snapshot); router.post('/:id/messages', c.send); router.get('/:id/events', eventsController(options)); return router; }
