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
    serviceName: 'specialist',
};

test('Specialist microservice worker score recording and eligibility-gated ranking', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'orchestrator',
            targetAudience: 'specialist',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        await client.post('/internal/v1/workers/scores', {
            workerId: 'worker-alpha',
            sampleCount: 25,
            qualityScore: 0.94,
            latencyMsP95: 300,
            costMicroUsdAvg: 400,
            healthy: true,
            hasCurrentGrant: true,
            hasCapacity: true,
            policyAllowed: true,
            evidenceRefs: ['ev-1'],
            measuredAt: '2026-10-21T12:00:00.000Z',
            validUntil: '2026-10-22T12:00:00.000Z',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-ws-1' },
        });

        const ranked = await client.post('/internal/v1/workers/rank', {
            candidates: [
                {
                    workerId: 'worker-alpha',
                    sampleCount: 25,
                    qualityScore: 0.94,
                    latencyMsP95: 300,
                    costMicroUsdAvg: 400,
                    healthy: true,
                    hasCurrentGrant: true,
                    hasCapacity: true,
                    policyAllowed: true,
                    evidenceRefs: ['ev-1'],
                    measuredAt: '2026-10-21T12:00:00.000Z',
                    validUntil: '2026-10-22T12:00:00.000Z',
                },
                {
                    workerId: 'worker-denied',
                    sampleCount: 25,
                    qualityScore: 0.99,
                    latencyMsP95: 100,
                    costMicroUsdAvg: 100,
                    healthy: true,
                    hasCurrentGrant: false,
                    hasCapacity: true,
                    policyAllowed: true,
                    evidenceRefs: ['ev-2'],
                    measuredAt: '2026-10-21T12:00:00.000Z',
                    validUntil: '2026-10-22T12:00:00.000Z',
                },
            ],
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-ws-rank' },
        });
        assert.equal(ranked.rankings.length, 2);
        assert.equal(ranked.rankings[0].workerId, 'worker-alpha');
        assert.equal(ranked.rankings[0].eligibility, 'eligible');
        assert.equal(ranked.rankings[1].workerId, 'worker-denied');
        assert.equal(ranked.rankings[1].eligibility, 'ineligible');
    }
    finally {
        await running.close();
    }
});
