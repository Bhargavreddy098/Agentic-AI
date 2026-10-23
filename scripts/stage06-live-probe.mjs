// @ts-check
// Stage 06 live negative-path probe. Temporary verification helper; not part of production.
import { createOpenAICompatibleAdapter } from '../backend/src/modules/providers/compatible.js';

const baseUrl = process.env.OPENAI_COMPATIBLE_BASE_URL;
const goodKey = process.env.OPENAI_COMPATIBLE_API_KEY;
const badKey = 'sk-wrongkey123456789012345678901234567890';

async function probe(label, opts) {
    const adapter = createOpenAICompatibleAdapter(opts);
    try {
        await adapter.discoverModels();
        console.log(label, '-> UNEXPECTED SUCCESS');
    } catch (error) {
        console.log(label, '->', error.code, error.status, error.message.slice(0, 80));
    }
}

// 1. Live revoked auth: a syntactically valid key the real endpoint rejects.
await probe('REVOKED_AUTH', { apiKey: badKey, baseUrl, fetchImpl: globalThis.fetch, timeoutMs: 30000 });

// 2. Live rate limit (429): fire many requests; the real provider throttles a
//    burst, and the adapter maps the 429 to PROVIDER_RATE_LIMITED.
let rateLimited = 0;
for (let i = 0; i < 20; i++) {
    const adapter = createOpenAICompatibleAdapter({
        apiKey: goodKey, baseUrl, fetchImpl: globalThis.fetch, timeoutMs: 30000,
    });
    try {
        await adapter.generate({ model: 'free/gpt-6-luna', prompt: 'say hi', maxOutputTokens: 8 });
    } catch (error) {
        if (error.code === 'PROVIDER_RATE_LIMITED') rateLimited++;
    }
}
console.log('RATE_LIMIT_429 ->', rateLimited > 0 ? 'PROVIDER_RATE_LIMITED (' + rateLimited + ' of 20)' : 'no 429 observed');

// 3. Live timeout: measure a real round-trip, then give the adapter a budget
//    far below it so the deadline aborts a genuine in-flight request.
const t0 = Date.now();
await fetch(baseUrl + '/models', { headers: { Authorization: 'Bearer ' + goodKey } });
const rtt = Date.now() - t0;
const budget = Math.max(1, Math.floor(rtt / 8));
console.log('roundTripMs=' + rtt, 'timeoutBudgetMs=' + budget);
await probe('TIMEOUT', { apiKey: goodKey, baseUrl, fetchImpl: globalThis.fetch, timeoutMs: budget });