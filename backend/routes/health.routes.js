import { Router } from 'express';
import { healthController } from '../controllers/health.controller.js';
export function healthRoutes(readiness, compatibility = false) { const router = Router(), controller = healthController(readiness, compatibility); router.get('/', controller.live); router.get('/live', controller.live); router.get('/ready', controller.ready); return router; }
