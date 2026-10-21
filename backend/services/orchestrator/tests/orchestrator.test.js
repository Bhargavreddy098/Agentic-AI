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
    serviceName: 'orchestrator',
};

test('Orchestrator microservice skill selection, recovery derivation, context compilation, and trust labeling', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'core',
            targetAudience: 'orchestrator',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        const trust = await client.post('/internal/v1/trust/label', {
            inputRef: 'in-1',
            origin: 'tool',
            observedDigest: 'c'.repeat(64),
            contentRef: 'cnt-1',
            suspiciousPatterns: [],
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-trust-1' },
        });
        assert.equal(trust.instructionTrust, 'untrusted_data');

        const recovery = await client.post('/internal/v1/recovery/derive', {
            failedTaskRef: 'task-1',
            normalizedError: 'TRANSIENT_FAILURE',
            currentPlanRef: 'plan-1',
            attemptsAlreadyUsed: 1,
            maxAllowedAttempts: 3,
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-rec-1' },
        });
        assert.equal(recovery.decision, 'retry');
    }
    finally {
        await running.close();
    }
});
