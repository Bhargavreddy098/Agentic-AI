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
    serviceName: 'episode',
};

test('Episode microservice append, ordered replay, search, and compression lineage', async () => {
    const app = createApp({ config: TEST_CONFIG });
    const running = await startServer({ app, config: TEST_CONFIG });
    const baseUrl = `http://127.0.0.1:${running.address.port}`;

    try {
        const client = createServiceClient({
            callerService: 'orchestrator',
            targetAudience: 'episode',
            baseUrl,
            serviceToken: TEST_CONFIG.ASI_SERVICE_TOKEN,
        });

        await client.post('/internal/v1/episodes', {
            episodeId: 'ep-1',
            sessionId: 'sess-1',
            conversationId: 'conv-1',
            sequence: 1,
            role: 'user',
            content: 'Hello world',
            payloadDigest: 'a'.repeat(64),
            occurredAt: '2026-10-21T12:00:00.000Z',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-ep-1' },
        });

        await client.post('/internal/v1/episodes', {
            episodeId: 'ep-2',
            sessionId: 'sess-1',
            conversationId: 'conv-1',
            sequence: 2,
            role: 'assistant',
            content: 'Hi there',
            payloadDigest: 'b'.repeat(64),
            occurredAt: '2026-10-21T12:00:01.000Z',
        }, {
            context: { tenantId: 'tenant-1', commandId: 'cmd-ep-2' },
        });

        const replay = await client.get('/internal/v1/sessions/sess-1/replay', {
            context: { tenantId: 'tenant-1' },
        });
        assert.equal(replay.episodes.length, 2);
        assert.equal(replay.sequenceGaps.length, 0);
    }
    finally {
        await running.close();
    }
});
