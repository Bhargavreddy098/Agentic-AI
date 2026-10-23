// @ts-check

const PRICING_REVISION = 'openai-pricing-2026-10-22';
const PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';

const pricing = (input, output, cachedInput) => Object.freeze({
    currency: 'USD',
    unit: 'per_million_tokens',
    inputMicroUsdPerMillion: input,
    outputMicroUsdPerMillion: output,
    cachedInputMicroUsdPerMillion: cachedInput,
    source: PRICING_SOURCE,
    effectiveAt: '2026-10-22',
    uncertaintyBps: 2500,
});

const capabilities = (quality, latency) => Object.freeze({
    chat: true,
    streaming: true,
    tools: true,
    structuredOutput: true,
    imageInput: true,
    embeddings: false,
    quality,
    latency,
});

export const OPENAI_PROFILES = Object.freeze({
    'gpt-5-mini': Object.freeze({
        externalModelId: 'gpt-5-mini',
        revision: 'gpt-5-mini-2025-08-07',
        contextLimit: 400000,
        maxInputTokens: 272000,
        maxOutputTokens: 128000,
        capabilities: capabilities(0.8, 0.8),
        pricing: pricing('250000', '2000000', '25000'),
        pricingRevision: PRICING_REVISION,
        qualificationRef: 'openai-gpt-5-mini-2026-10-22',
    }),
    'gpt-5-mini-2025-08-07': Object.freeze({
        externalModelId: 'gpt-5-mini',
        revision: 'gpt-5-mini-2025-08-07',
        contextLimit: 400000,
        maxInputTokens: 272000,
        maxOutputTokens: 128000,
        capabilities: capabilities(0.8, 0.8),
        pricing: pricing('250000', '2000000', '25000'),
        pricingRevision: PRICING_REVISION,
        qualificationRef: 'openai-gpt-5-mini-2026-10-22',
    }),
});

export function profileFor(externalModelId) {
    return OPENAI_PROFILES[externalModelId] ?? null;
}

const RATE_FIELDS = ['inputMicroUsdPerMillion', 'outputMicroUsdPerMillion', 'cachedInputMicroUsdPerMillion'];

export function knownPricing(value) {
    return Boolean(value) && typeof value === 'object' && RATE_FIELDS.every(field => typeof value[field] === 'string' && /^\d{1,19}$/.test(value[field]));
}

export function estimateMicroUsd({ pricing: rates, inputTokens, outputTokens, marginBps = 2500 }) {
    if (!knownPricing(rates)) throw new Error('Unknown pricing');
    if (!Number.isSafeInteger(inputTokens) || inputTokens < 0) throw new Error('Invalid input token estimate');
    if (!Number.isSafeInteger(outputTokens) || outputTokens < 0) throw new Error('Invalid output token estimate');
    const input = BigInt(inputTokens) * BigInt(rates.inputMicroUsdPerMillion);
    const output = BigInt(outputTokens) * BigInt(rates.outputMicroUsdPerMillion);
    const subtotal = input + output;
    const margin = BigInt(marginBps);
    return ((subtotal * (10000n + margin)) + 9999999999n) / 10000000000n;
}

export function validateUsage(usage) {
    if (!usage || !['inputTokens', 'outputTokens', 'totalTokens', 'cachedInputTokens', 'reasoningTokens']
        .every(key => Number.isSafeInteger(usage[key]) && usage[key] >= 0)
        || usage.totalTokens !== usage.inputTokens + usage.outputTokens
        || usage.cachedInputTokens > usage.inputTokens || usage.reasoningTokens > usage.outputTokens) {
        throw new Error('Unknown or inconsistent provider usage');
    }
    return usage;
}

export function estimateFromUsage(rates, usage) {
    if (!knownPricing(rates)) throw new Error('Unknown pricing');
    // Pricing also serves internal callers; validate primary totals even outside an adapter.
    validateUsage({ ...usage, totalTokens: usage?.totalTokens ?? (usage?.inputTokens + usage?.outputTokens), cachedInputTokens: usage?.cachedInputTokens ?? 0, reasoningTokens: usage?.reasoningTokens ?? 0 });
    const input = BigInt(usage.inputTokens);
    const cached = BigInt(usage.cachedInputTokens ?? 0);
    const output = BigInt(usage.outputTokens);
    const uncached = input > cached ? input - cached : 0n;
    return (uncached * BigInt(rates.inputMicroUsdPerMillion)
        + cached * BigInt(rates.cachedInputMicroUsdPerMillion)
        + output * BigInt(rates.outputMicroUsdPerMillion) + 999999n) / 1000000n;
}
