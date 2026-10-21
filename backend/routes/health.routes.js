import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
export function healthRoutes(readiness) { const router = Router(), controller = healthController(readiness); router.get('/', controller.live); router.get('/live', controller.live); router.get('/ready', controller.ready); return router; }
