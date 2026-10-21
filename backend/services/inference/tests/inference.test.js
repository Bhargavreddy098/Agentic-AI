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
    serviceName: 'inference',
};

test('Inference microservice privacy-filtered routing, governed generation, and usage reconciliation', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'orchestrator',
            targetAudience: 'inference',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        const routed = await client.post('/internal/v1/route', {
            taskClass: 'generation',
            requiredPrivacyTier: 'zero_retention',
            policyDecisionRef: 'pol-1',
            budgetReservationRef: 'res-1',
            qualifiedCandidateModelRefs: [
                { modelRef: 'ext-model', privacyTier: 'standard', policyApproved: true, qualityScore: 0.98, costMicroUsdPer1k: 500, latencyMsP95: 200 },
                { modelRef: 'enclave-model', privacyTier: 'zero_retention', policyApproved: true, qualityScore: 0.92, costMicroUsdPer1k: 1200, latencyMsP95: 250 },
            ],
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-route-1' },
        });
        assert.equal(routed.selectedModelRef, 'enclave-model');

        const gen = await client.post('/internal/v1/generate', {
            requestId: 'req-gen-1',
            modelRef: 'enclave-model',
            privacyTier: 'zero_retention',
            policyDecisionRef: 'pol-1',
            budgetReservationRef: 'res-1',
            prompt: 'Summarize status',
            maxOutputTokens: 256,
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-gen-1' },
        });
        assert.equal(gen.status, 'unavailable');

        const usage = await client.post('/internal/v1/usage/reconcile', {
            requestId: 'req-gen-1',
            budgetReservationRef: 'res-1',
            status: 'settled',
            usage: {
                promptTokens: 50,
                completionTokens: 25,
                totalTokens: 75,
                costMicroUsd: 150,
            },
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-usage-1' },
        });
        assert.equal(usage.status, 'settled');
    }
    finally {
        await running.close();
    }
});
