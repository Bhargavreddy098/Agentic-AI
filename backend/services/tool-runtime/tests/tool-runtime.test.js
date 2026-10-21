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
    serviceName: 'tool-runtime',
};

test('Tool Runtime microservice manifest registration and governed execution gating', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'orchestrator',
            targetAudience: 'tool-runtime',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        const manifest = await client.post('/internal/v1/manifests', {
            toolId: 'fs.read',
            version: '1.0.0',
            manifestDigest: 'd'.repeat(64),
            signatureVerified: true,
            sideEffectClass: 'read_only',
            requiresApproval: false,
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-tm-1' },
        });
        assert.equal(manifest.status, 'created');
        assert.equal(manifest.record.toolId, 'fs.read');

        const execution = await client.post('/internal/v1/executions', {
            executionId: 'exec-1',
            toolId: 'fs.read',
            version: '1.0.0',
            inputDigest: 'e'.repeat(64),
            leaseEpoch: 1,
            grantRef: 'grant-1',
            policyDecisionRef: 'pol-1',
            budgetReservationRef: 'res-1',
            audience: 'tool-runtime',
            expiresAt: '2026-10-22T00:00:00.000Z',
            sandboxQualified: false,
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-exec-1' },
        });
        assert.equal(execution.status, 'unavailable');
    }
    finally {
        await running.close();
    }
});
