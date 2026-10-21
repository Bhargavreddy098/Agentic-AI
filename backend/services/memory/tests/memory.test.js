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
    serviceName: 'memory',
};

test('Memory microservice health, vector validation, and owned memory models', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'orchestrator',
            targetAudience: 'memory',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        const families = await client.get('/internal/v1/families', {
            context: { tenantId: 'tenant-1' },
        });
        assert.deepEqual(families.families, [
            'consolidation-candidate',
            'observation',
            'memory-lifecycle',
            'memory-branch',
        ]);

        const branch = await client.post('/internal/v1/models/memory-branch/createBranch', {
            args: [{
                branchId: 'branch-1',
                expiresAt: '2026-10-22T12:00:00.000Z',
                grantRefs: ['grant-1'],
                visibilityScope: 'Private',
            }],
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-mb-1' },
        });
        assert.equal(branch.result.status, 'created');
        assert.equal(branch.result.record.branchId, 'branch-1');

        const vecRes = await client.post('/internal/v1/vectors/search', {
            embedding: Array.from({ length: 1536 }, () => 0.01),
            limit: 5,
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-vec-1' },
        });
        assert.ok(Array.isArray(vecRes.items));
    }
    finally {
        await running.close();
    }
});
