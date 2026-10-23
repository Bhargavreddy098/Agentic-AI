// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateMicroUsd, estimateFromUsage, profileFor } from '../src/modules/providers/catalog.js';
import { buildRoutingDecision } from '../src/modules/providers/router.js';
import { CircuitBreaker, ProviderError, createOpenAIAdapter } from '../src/modules/providers/openai.js';
import { compatibleProfileFromEnv, createOpenAICompatibleAdapter, normalizeCompatibleBaseUrl } from '../src/modules/providers/compatible.js';

const policyRevisionId = '11111111-1111-4111-8111-111111111111';
const model = (overrides = {}) => ({
    id: '22222222-2222-4222-8222-222222222222',
    provider_enabled: true,
    provider_status: 'healthy',
    availability: 'available',
    pricing: profileFor('gpt-5-mini').pricing,
    context_limit: 400000,
    max_output_tokens: 128000,
    capabilities: profileFor('gpt-5-mini').capabilities,
    privacy_policy: { allowedClassifications: ['public', 'internal'] },
    ...overrides,
});
const input = (overrides = {}) => ({
    capabilities: ['chat', 'structuredOutput'],
    estimatedInputTokens: 1000,
    maxOutputTokens: 100,
    classification: 'internal',
    budgetCeilingMicroUsd: '10000',
    ...overrides,
});

test('pricing estimates are conservative, deterministic, and reject unknown rates', () => {
    const rates = profileFor('gpt-5-mini').pricing;
    assert.equal(estimateMicroUsd({ pricing: rates, inputTokens: 1000, outputTokens: 100 }).toString(), '563');
    assert.equal(estimateFromUsage(rates, { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 0 }).toString(), '450');
    assert.equal(estimateFromUsage(rates, { inputTokens: 1000, outputTokens: 100, cachedInputTokens: 500 }).toString(), '338');
    assert.throws(() => estimateMicroUsd({ pricing: { known: false }, inputTokens: 1, outputTokens: 1 }), /Unknown pricing/);
    assert.throws(() => estimateMicroUsd({ pricing: rates, inputTokens: -1, outputTokens: 1 }), /Invalid input/);
});

test('router hard-filters privacy, capability, context, availability, and budget before scoring', () => {
    const decision = buildRoutingDecision({ models: [model()], input: input(), policyRevisionId });
    assert.equal(decision.selectedModelId, model().id);
    assert.equal(decision.estimatedCeilingMicroUsd, '563');
    assert.deepEqual(decision.rejected, []);
    for (const [overrides, reason] of [
        [{ provider_status: 'disabled' }, 'PROVIDER_DISABLED'],
        [{ provider_status: 'degraded' }, 'PROVIDER_UNHEALTHY'],
        [{ provider_status: 'unavailable' }, 'PROVIDER_UNHEALTHY'],
        [{ availability: 'unknown' }, 'MODEL_UNAVAILABLE'],
        [{ privacy_policy: { allowedClassifications: ['public'] } }, 'PRIVACY_DENIED'],
        [{ capabilities: { chat: false } }, 'CAPABILITY_MISSING'],
        [{ context_limit: 100 }, 'CONTEXT_EXCEEDED'],
        [{ max_input_tokens: 10 }, 'CONTEXT_EXCEEDED'],
        [{ pricing: { known: false } }, 'PRICING_UNKNOWN'],
    ]) {
        const result = buildRoutingDecision({ models: [model(overrides)], input: input(), policyRevisionId });
        assert.equal(result.selectedModelId, undefined);
        assert.equal(result.rejected[0].reasons[0], reason);
    }
    const budget = buildRoutingDecision({ models: [model()], input: input({ budgetCeilingMicroUsd: '1' }), policyRevisionId });
    assert.equal(budget.rejected[0].reasons[0], 'BUDGET_EXCEEDED');
    const denied = buildRoutingDecision({ models: [model({ endpoint_policy: { baseUrl: 'https://api.openai.com/v1' } })], input: input(), policyRevisionId,
        policyPrivacy: { denyEgress: true, allowedEgressHosts: ['api.openai.com'] } });
    assert.equal(denied.rejected[0].reasons[0], 'POLICY_EGRESS_DENIED');
});

test('both adapters reject missing, negative, and inconsistent usage instead of reporting zero cost', async () => {
    const invalid = [undefined, {}, { input_tokens: -1, output_tokens: 1, total_tokens: 0 },
        { input_tokens: 10, output_tokens: 5, total_tokens: 100 },
        { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 11 } }];
    for (const usage of invalid) {
        const official = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async () => new Response(JSON.stringify({ output_text: 'done', usage })) });
        await assert.rejects(official.generate({ model: 'gpt-5-mini', prompt: 'x' }), error => error.code === 'PROVIDER_USAGE_UNKNOWN');
        const chatUsage = usage ? { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, total_tokens: usage.total_tokens,
            ...(usage.input_tokens_details ? { prompt_tokens_details: usage.input_tokens_details } : {}) } : undefined;
        const compatible = createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://provider.example/v1',
            fetchImpl: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }], usage: chatUsage })) });
        await assert.rejects(compatible.generate({ model: 'configured-model', prompt: 'x' }), error => error.code === 'PROVIDER_USAGE_UNKNOWN');
    }
    assert.throws(() => estimateFromUsage(profileFor('gpt-5-mini').pricing, {}), /Unknown or inconsistent/);
});

test('OpenAI adapter uses the official endpoint, disables redirects, and normalizes usage', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(JSON.stringify({
            id: 'resp_1', status: 'completed', output_text: 'bounded result',
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 2 } },
        }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req_1' } });
    };
    const adapter = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl });
    const result = await adapter.generate({ model: 'gpt-5-mini', prompt: 'hello', maxOutputTokens: 16 });
    assert.equal(result.text, 'bounded result');
    assert.equal(result.providerRequestId, 'req_1');
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 2, reasoningTokens: 0 });
    assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key-that-is-long-enough');
    assert.equal(JSON.parse(calls[0].options.body).store, false);
    assert.equal(JSON.parse(calls[0].options.body).reasoning.effort, 'minimal');
});

test('OpenAI adapter fails closed on auth, timeout, unknown pricing, and malformed output', async () => {
    const auth = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async () => new Response('{}', { status: 401 }) });
    await assert.rejects(auth.discoverModels(), error => error instanceof ProviderError && error.code === 'PROVIDER_AUTH_FAILED');
    const timeout = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; } });
    await assert.rejects(timeout.generate({ model: 'gpt-5-mini', prompt: 'x' }), error => error instanceof ProviderError && error.code === 'PROVIDER_TIMEOUT' && error.retryable);
    const malformed = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async () => new Response(JSON.stringify({ usage: {} }), { status: 200 }) });
    await assert.rejects(malformed.generate({ model: 'gpt-5-mini', prompt: 'x' }), error => error.code === 'PROVIDER_INVALID_RESPONSE');
    assert.throws(() => createOpenAIAdapter({ apiKey: 'short', fetchImpl: async () => new Response('') }), error => error.code === 'CREDENTIAL_UNAVAILABLE');
});

test('OpenAI adapter streams bounded events and cancellation surfaces as timeout', async () => {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"hello"}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            controller.close();
        },
    });
    const adapter = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async () => new Response(stream, { status: 200 }) });
    const events = [];
    for await (const event of adapter.stream({ model: 'gpt-5-mini', prompt: 'x', maxOutputTokens: 8 })) events.push(event);
    assert.equal(events.length, 1);
    assert.equal(events[0].delta, 'hello');
    const cancelled = new AbortController();
    cancelled.abort();
    const cancelAdapter = createOpenAIAdapter({ apiKey: 'test-key-that-is-long-enough', fetchImpl: async (_url, options) => {
        if (options.signal.aborted) { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
        return new Response('{}');
    } });
    await assert.rejects(cancelAdapter.generate({ model: 'gpt-5-mini', prompt: 'x', signal: cancelled.signal }), error => error.code === 'PROVIDER_TIMEOUT');
});

test('compatible endpoint allowlist rejects unsafe URLs and accepts public HTTPS /v1 bases', () => {
    assert.equal(normalizeCompatibleBaseUrl('https://api.apinex.bond/v1'), 'https://api.apinex.bond/v1');
    assert.equal(normalizeCompatibleBaseUrl('https://api.apinex.bond/v1/'), 'https://api.apinex.bond/v1');
    for (const value of [
        'http://api.apinex.bond/v1',
        'https://localhost/v1',
        'https://127.0.0.1/v1',
        'https://10.0.0.1/v1',
        'https://api.local/v1',
        'https://api.apinex.bond/v2',
        'https://api.apinex.bond/v1?q=1',
        'https://user:pass@api.apinex.bond/v1',
        'https://api/v1',
        'https://example.123/v1',
    ]) {
        assert.throws(() => normalizeCompatibleBaseUrl(value), error => error.code === 'ENDPOINT_NOT_ALLOWED', value);
    }
});

test('compatible model profile requires explicit operator pricing and bounds', () => {
    const profile = compatibleProfileFromEnv({
        OPENAI_COMPATIBLE_MODEL: 'free/gpt-6-luna',
        OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION: '0',
        OPENAI_COMPATIBLE_OUTPUT_MICRO_USD_PER_MILLION: '0',
        OPENAI_COMPATIBLE_CONTEXT_LIMIT: '128000',
        OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS: '4096',
    });
    assert.equal(profile.externalModelId, 'free/gpt-6-luna');
    assert.equal(profile.pricing.inputMicroUsdPerMillion, '0');
    assert.equal(profile.pricing.source, 'operator-configured');
    assert.equal(profile.capabilities.chat, true);
    assert.equal(profile.capabilities.tools, false);
    assert.throws(() => compatibleProfileFromEnv({ OPENAI_COMPATIBLE_MODEL: 'x' }), /OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION/);
    assert.throws(() => compatibleProfileFromEnv({
        OPENAI_COMPATIBLE_MODEL: 'x', OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION: '1',
        OPENAI_COMPATIBLE_OUTPUT_MICRO_USD_PER_MILLION: '1', OPENAI_COMPATIBLE_CONTEXT_LIMIT: '0',
    }), /OPENAI_COMPATIBLE_CONTEXT_LIMIT/);
    assert.equal(compatibleProfileFromEnv({}), null);
});

test('compatible adapter uses Chat Completions, disables redirects, and normalizes usage', async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(JSON.stringify({
            id: 'chatcmpl_1',
            choices: [{ message: { content: 'bounded result' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 1 } },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const adapter = createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://api.apinex.bond/v1', fetchImpl });
    const result = await adapter.generate({ model: 'free/gpt-6-luna', prompt: 'hello', maxOutputTokens: 16 });
    assert.equal(result.text, 'bounded result');
    assert.equal(result.finishReason, 'stop');
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedInputTokens: 2, reasoningTokens: 1 });
    assert.equal(calls[0].url, 'https://api.apinex.bond/v1/chat/completions');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-key-that-is-long-enough');
    assert.equal(JSON.parse(calls[0].options.body).model, 'free/gpt-6-luna');
    assert.equal(JSON.parse(calls[0].options.body).stream, false);
});

test('compatible adapter discovers models and fails closed on auth or malformed output', async () => {
    const adapter = createOpenAICompatibleAdapter({
        apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://api.apinex.bond/v1',
        fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'free/gpt-6-luna', created: 1 }, { id: 'other' }] }), { status: 200 }),
    });
    assert.deepEqual(await adapter.discoverModels(), [{ externalModelId: 'free/gpt-6-luna', created: 1 }, { externalModelId: 'other', created: null }]);
    const auth = createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://api.apinex.bond/v1', fetchImpl: async () => new Response('{}', { status: 401 }) });
    await assert.rejects(auth.generate({ model: 'x', prompt: 'x' }), error => error.code === 'PROVIDER_AUTH_FAILED');
    const malformed = createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://api.apinex.bond/v1', fetchImpl: async () => new Response(JSON.stringify({ usage: {} }), { status: 200 }) });
    await assert.rejects(malformed.generate({ model: 'x', prompt: 'x' }), error => error.code === 'PROVIDER_INVALID_RESPONSE');
    assert.throws(() => createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://localhost/v1', fetchImpl: async () => new Response('') }), error => error.code === 'ENDPOINT_NOT_ALLOWED');
});

test('compatible adapter streams text deltas', async () => {
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'));
            controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
            controller.close();
        },
    });
    const adapter = createOpenAICompatibleAdapter({ apiKey: 'test-key-that-is-long-enough', baseUrl: 'https://api.apinex.bond/v1', fetchImpl: async () => new Response(stream, { status: 200 }) });
    const events = [];
    for await (const event of adapter.stream({ model: 'free/gpt-6-luna', prompt: 'x', maxOutputTokens: 8 })) events.push(event);
    assert.deepEqual(events, [{ delta: 'hello' }, { finishReason: 'stop' }]);
});

test('circuit breaker opens after transient failures and allows one half-open probe', async () => {
    let now = 0;
    const breaker = new CircuitBreaker({ threshold: 2, openMs: 1000, now: () => now });
    const fail = async () => { throw new ProviderError('PROVIDER_UNAVAILABLE', 'down', { retryable: true }); };
    await assert.rejects(breaker.execute(fail));
    await assert.rejects(breaker.execute(fail));
    await assert.rejects(breaker.execute(fail), error => error.code === 'PROVIDER_CIRCUIT_OPEN');
    now = 1001;
    assert.equal(await breaker.execute(async () => 'ok'), 'ok');
    assert.equal(breaker.state(), 'closed');
});
