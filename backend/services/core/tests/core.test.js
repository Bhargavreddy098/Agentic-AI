import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { startServer } from '../server.js';
import { createServiceClient } from '../../../utils/service-clients.js';

const TEST_CONFIG = {
    PORT: 0,
    HOST: '127.0.0.1',
    SHUTDOWN_TIMEOUT_MS: 2000,
    ASI_SERVICE_TOKEN: 'test-internal-secret-123456',
    serviceName: 'core',
};

test('Core microservice health, internal auth, durable conversations/goals, CAS, idempotency, and model endpoints', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const liveRes = await fetch(`${baseUrl}/health/live`);
        assert.equal(liveRes.status, 200);
        const liveBody = await liveRes.json();
        assert.equal(liveBody.service, 'core');

        const unauthRes = await fetch(`${baseUrl}/internal/v1/families`);
        assert.equal(unauthRes.status, 401);

        const client = createServiceClient({
            callerService: 'api-gateway',
            targetAudience: 'core',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        const familiesRes = await client.get('/internal/v1/families', {
            context: { tenantId: 'tenant-1' },
        });
        assert.equal(familiesRes.families.length, 33);

        const conv1 = await client.post('/internal/v1/conversations', {
            conversationId: 'conv-100',
            title: 'Architecture Review',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-conv-1' },
        });
        assert.equal(conv1.status, 'created');
        assert.equal(conv1.record.conversationId, 'conv-100');
        assert.equal(conv1.record.revision, 1);

        const convDup = await client.post('/internal/v1/conversations', {
            conversationId: 'conv-100',
            title: 'Architecture Review',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-conv-1' },
        });
        assert.equal(convDup.status, 'same_existing');
        assert.equal(convDup.record.revision, 1);

        const convRev2 = await client.patch('/internal/v1/conversations/conv-100', {
            expectedRevision: 1,
            title: 'Architecture Review v2',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-conv-2' },
        });
        assert.equal(convRev2.status, 'updated');
        assert.equal(convRev2.record.revision, 2);
        assert.equal(convRev2.record.title, 'Architecture Review v2');

        const projectRes = await client.post('/internal/v1/models/project/createProject', {
            args: [{
                projectId: 'proj-core-1',
                conversationId: 'conv-100',
                title: 'Core Service Project',
            }],
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-proj-1' },
        });
        assert.equal(projectRes.result.status, 'created');
        assert.equal(projectRes.result.record.projectId, 'proj-core-1');
    }
    finally {
        await running.close();
    }
});
