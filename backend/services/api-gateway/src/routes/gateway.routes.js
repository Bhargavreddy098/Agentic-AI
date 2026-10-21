import { uiRoutes } from '../../../../routes/index.js';
import { createGatewayController } from '../controllers/gateway.controller.js';

export function createGatewayRoutes({ config, services, gatewayService }) {
    const router = uiRoutes({ config, services });
    const c = createGatewayController(gatewayService);

    router.post('/durable/conversations', c.createDurableConversation);
    router.get('/durable/conversations/:id', c.getDurableConversation);
    router.post('/durable/goals', c.createDurableGoal);
    router.get('/durable/goals/:id', c.getDurableGoal);
    return router;
}
