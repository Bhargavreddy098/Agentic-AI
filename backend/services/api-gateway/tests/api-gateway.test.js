import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp as createCoreApp } from '../../core/src/app.js';
import { startServer as startCoreServer } from '../../core/server.js';
import { createApp as createGatewayApp } from '../src/app.js';
import { startServer as startGatewayServer } from '../server.js';
import { createMemoryUiPorts } from '../../../workers/gateway/dist/ui/memory-ports.js';

const SHARED_SECRET = 'gateway-core-shared-secret-123456';
const ORIGIN = 'http://127.0.0.1:3200';

test('API Gateway forwards durable conversation and goal mutations to Core over authenticated internal HTTP and hides /internal/v1', async () => {
    const coreConfig = {
        PORT: 0,
        HOST: '127.0.0.1',
        SHUTDOWN_TIMEOUT_MS: 2000,
        ASI_SERVICE_TOKEN: SHARED_SECRET,
        serviceName: 'core',
    };
    const coreRunning = await startCoreServer({
        app: createCoreApp({ config: coreConfig }),
        config: coreConfig,
    });
    const coreUrl = `http://127.0.0.1:${coreRunning.address.port}`;

    const ports = createMemoryUiPorts();
    const gatewayConfig = {
        PORT: 0,
        HOST: '127.0.0.1',
        SHUTDOWN_TIMEOUT_MS: 2000,
        ASI_SERVICE_TOKEN: SHARED_SECRET,
        serviceName: 'api-gateway',
        CORE_SERVICE_URL: coreUrl,
        allowedOrigins: [ORIGIN],
    };
    const gatewayRunning = await startGatewayServer({
        app: createGatewayApp({ config: gatewayConfig, services: ports }),
        config: gatewayConfig,
    });
    const gatewayUrl = `http://127.0.0.1:${gatewayRunning.address.port}`;

    try {
        // 1. Gateway does not expose /internal/v1
        const internalProbe = await fetch(`${gatewayUrl}/internal/v1/families`);
        assert.equal(internalProbe.status, 404);

        // 2. Establish authenticated UI session with CSRF token
        const loginRes = await fetch(`${gatewayUrl}/api/ui/v1/auth/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ assertion: 'assert-workspace-a' }),
        });
        assert.equal(loginRes.status, 200);
        const cookie = loginRes.headers.get('set-cookie').split(';')[0];
        const { csrfToken } = await loginRes.json();

        // 3. Durable conversation creation via Gateway -> Core network path
        const createConvRes = await fetch(`${gatewayUrl}/api/ui/v1/durable/conversations`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                cookie,
                origin: ORIGIN,
                'x-csrf-token': csrfToken,
            },
            body: JSON.stringify({
                conversationId: 'conv-gw-1',
                title: 'Gateway to Core Durable Conversation',
                commandId: 'cmd-gw-conv-1',
            }),
        });
        assert.equal(createConvRes.status, 201);
        const createdConv = await createConvRes.json();
        assert.equal(createdConv.record.conversationId, 'conv-gw-1');

        // 4. Read durable conversation back through Gateway -> Core
        const getConvRes = await fetch(`${gatewayUrl}/api/ui/v1/durable/conversations/conv-gw-1`, {
            headers: { cookie, origin: ORIGIN },
        });
        assert.equal(getConvRes.status, 200);
        const fetchedConv = await getConvRes.json();
        assert.equal(fetchedConv.title, 'Gateway to Core Durable Conversation');
    }
    finally {
        await gatewayRunning.close();
        await coreRunning.close();
    }
});
