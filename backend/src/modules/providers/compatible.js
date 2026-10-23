// @ts-check
import { CircuitBreaker, ProviderError, errorFor } from './openai.js';
import { validateUsage } from './catalog.js';

const MAX_TOKENS = 1000000;
const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal|0\.0\.0\.0)$/i;

export function normalizeCompatibleBaseUrl(value) {
    if (typeof value !== 'string' || value.length > 512) throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'The compatible endpoint is invalid.', { status: 400 });
    let url;
    try { url = new URL(value); }
    catch { throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'The compatible endpoint is invalid.', { status: 400 }); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'The compatible endpoint must be an HTTPS base URL without credentials or query data.', { status: 400 });
    }
    if (url.pathname !== '/v1' && url.pathname !== '/v1/') throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'The compatible endpoint must end with /v1.', { status: 400 });
    const host = url.hostname.toLowerCase();
    const labels = host.split('.');
    if (PRIVATE_HOST.test(host) || !host.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.startsWith('[')
        || !labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
        || !/[a-z]/.test(labels.at(-1))) {
        throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'The compatible endpoint must be a public DNS hostname.', { status: 400 });
    }
    return url.origin + '/v1';
}

function integer(value, fallback, label) {
    if (value === undefined || value === '') return fallback;
    if (!/^\d{1,7}$/.test(value)) throw new Error('Invalid ' + label + '.');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > MAX_TOKENS) throw new Error('Invalid ' + label + '.');
    return parsed;
}

function rate(value, label) {
    if (typeof value !== 'string' || !/^\d{1,19}$/.test(value)) throw new Error('Invalid ' + label + '.');
    return value;
}

export function compatibleProfileFromEnv(env = process.env) {
    const externalModelId = env.OPENAI_COMPATIBLE_MODEL?.trim();
    if (!externalModelId) return null;
    if (externalModelId.length > 200) throw new Error('OPENAI_COMPATIBLE_MODEL is too long.');
    const input = rate(env.OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION, 'OPENAI_COMPATIBLE_INPUT_MICRO_USD_PER_MILLION');
    const output = rate(env.OPENAI_COMPATIBLE_OUTPUT_MICRO_USD_PER_MILLION, 'OPENAI_COMPATIBLE_OUTPUT_MICRO_USD_PER_MILLION');
    const cached = rate(env.OPENAI_COMPATIBLE_CACHED_INPUT_MICRO_USD_PER_MILLION ?? input, 'OPENAI_COMPATIBLE_CACHED_INPUT_MICRO_USD_PER_MILLION');
    return Object.freeze({
        externalModelId,
        revision: env.OPENAI_COMPATIBLE_MODEL_REVISION?.trim() || externalModelId,
        contextLimit: integer(env.OPENAI_COMPATIBLE_CONTEXT_LIMIT, 128000, 'OPENAI_COMPATIBLE_CONTEXT_LIMIT'),
        maxInputTokens: integer(env.OPENAI_COMPATIBLE_MAX_INPUT_TOKENS, integer(env.OPENAI_COMPATIBLE_CONTEXT_LIMIT, 128000, 'OPENAI_COMPATIBLE_CONTEXT_LIMIT'), 'OPENAI_COMPATIBLE_MAX_INPUT_TOKENS'),
        maxOutputTokens: integer(env.OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS, 16384, 'OPENAI_COMPATIBLE_MAX_OUTPUT_TOKENS'),
        capabilities: Object.freeze({
            chat: true,
            streaming: true,
            tools: env.OPENAI_COMPATIBLE_TOOLS === 'true',
            structuredOutput: env.OPENAI_COMPATIBLE_STRUCTURED_OUTPUT === 'true',
            imageInput: false,
            embeddings: false,
            quality: 0.5,
            latency: 0.5,
        }),
        pricing: Object.freeze({
            currency: 'USD',
            unit: 'per_million_tokens',
            inputMicroUsdPerMillion: input,
            outputMicroUsdPerMillion: output,
            cachedInputMicroUsdPerMillion: cached,
            source: 'operator-configured',
            effectiveAt: env.OPENAI_COMPATIBLE_PRICING_EFFECTIVE_AT?.trim() || '2026-10-22',
            uncertaintyBps: 2500,
        }),
        pricingRevision: env.OPENAI_COMPATIBLE_PRICING_REVISION?.trim() || 'operator-configured-2026-10-22',
        qualificationRef: 'openai-compatible-' + externalModelId,
    });
}

function contentText(content) {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map(part => typeof part?.text === 'string' ? part.text : '').join('');
}

function usageFromChat(payload) {
    const usage = payload?.usage ?? {};
    try { return validateUsage({
        inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    }); } catch { throw new ProviderError('PROVIDER_USAGE_UNKNOWN', 'Provider usage is missing or inconsistent; charges require reconciliation.', { status: 502 }); }
}

/** @param {{ apiKey?: string, baseUrl?: string, fetchImpl?: typeof fetch, timeoutMs?: number }} [options] */
export function createOpenAICompatibleAdapter({ apiKey, baseUrl, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
    if (typeof apiKey !== 'string' || apiKey.length < 20) throw new ProviderError('CREDENTIAL_UNAVAILABLE', 'Provider credentials are not configured.', { status: 503 });
    const endpoint = normalizeCompatibleBaseUrl(baseUrl);
    if (typeof fetchImpl !== 'function') throw new ProviderError('PROVIDER_UNAVAILABLE', 'HTTP transport is unavailable.', { status: 503 });
    const breaker = new CircuitBreaker();

    /** @param {string} path @param {{ method?: string, body?: unknown, signal?: AbortSignal, deadlineMs?: number }} [options] */
    async function request(path, { method = 'GET', body, signal, deadlineMs } = {}) {
        const controller = new AbortController();
        const signals = [controller.signal];
        if (signal) signals.push(signal);
        const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, deadlineMs ?? timeoutMs)));
        timer.unref?.();
        try {
            let response;
            try {
                response = await fetchImpl(endpoint + path, {
                    method,
                    redirect: 'error',
                    signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals),
                    headers: {
                        Authorization: 'Bearer ' + apiKey,
                        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                    },
                    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                });
            } catch (error) {
                if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
                    throw new ProviderError('PROVIDER_TIMEOUT', 'Provider request timed out.', { status: 504, retryable: true });
                }
                throw new ProviderError('PROVIDER_UNAVAILABLE', 'Provider could not be reached.', { status: 503, retryable: true });
            }
            if (!response.ok) {
                let detail = '';
                try {
                    const payload = await response.json();
                    if (typeof payload?.error?.message === 'string') detail = payload.error.message.slice(0, 500);
                } catch { /* Provider error bodies are not required for a safe result. */ }
                throw errorFor(response.status, detail);
            }
            return response;
        } finally {
            clearTimeout(timer);
        }
    }

    const adapter = {
        /** @param {{ signal?: AbortSignal, deadlineMs?: number }} [options] */
        async discoverModels({ signal, deadlineMs } = {}) {
            return breaker.execute(async () => {
                const response = await request('/models', { signal, deadlineMs });
                let body;
                try { body = await response.json(); }
                catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned an invalid model catalog.', { status: 502 }); }
                if (!Array.isArray(body?.data)) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned an invalid model catalog.', { status: 502 });
                return body.data
                    .filter(item => typeof item?.id === 'string' && item.id.length <= 200)
                    .slice(0, 500)
                    .map(item => ({ externalModelId: item.id, created: Number.isSafeInteger(item.created) ? item.created : null }));
            });
        },
        /** @param {{ signal?: AbortSignal, deadlineMs?: number }} [options] */
        async health(options = {}) {
            await adapter.discoverModels(options);
            return { state: 'healthy', checkedAt: new Date().toISOString() };
        },
        /** @param {{ model: string, messages?: Array<{role:string,content:string}>, prompt?: string, responseSchema?: object, maxOutputTokens?: number, signal?: AbortSignal, deadlineMs?: number, classification?: string }} input */
        async generate({ model, messages, prompt, responseSchema, maxOutputTokens = 256, signal, deadlineMs, classification = 'internal' }) {
            if (!['public', 'internal'].includes(classification)) throw new ProviderError('PRIVACY_DENIED', 'This provider cannot receive restricted content.', { status: 403 });
            return breaker.execute(async () => {
                const started = Date.now();
                const chatMessages = Array.isArray(messages)
                    ? messages.map(message => ({ role: message.role, content: message.content }))
                    : [{ role: 'user', content: prompt ?? '' }];
                const body = {
                    model,
                    messages: chatMessages,
                    max_tokens: maxOutputTokens,
                    stream: false,
                    ...(responseSchema ? { response_format: { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: responseSchema } } } : {}),
                };
                const response = await request('/chat/completions', { method: 'POST', body, signal, deadlineMs });
                let payload;
                try { payload = await response.json(); }
                catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned an invalid response.', { status: 502 }); }
                const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
                const text = contentText(choice?.message?.content);
                if (!text) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned no text content.', { status: 502 });
                return {
                    text,
                    finishReason: choice?.finish_reason ?? 'unknown',
                    providerRequestId: response.headers.get('x-request-id') ?? payload?.id ?? null,
                    usage: usageFromChat(payload),
                    latencyMs: Date.now() - started,
                };
            });
        },
        /** @param {{ model: string, messages?: Array<{role:string,content:string}>, prompt?: string, maxOutputTokens?: number, signal?: AbortSignal, deadlineMs?: number, classification?: string }} input */
        async *stream({ model, messages, prompt, maxOutputTokens = 256, signal, deadlineMs, classification = 'internal' }) {
            if (!['public', 'internal'].includes(classification)) throw new ProviderError('PRIVACY_DENIED', 'This provider cannot receive restricted content.', { status: 403 });
            const response = await breaker.execute(async () => {
                const chatMessages = Array.isArray(messages)
                    ? messages.map(message => ({ role: message.role, content: message.content }))
                    : [{ role: 'user', content: prompt ?? '' }];
                return request('/chat/completions', {
                    method: 'POST',
                    signal,
                    deadlineMs,
                    body: { model, messages: chatMessages, max_tokens: maxOutputTokens, stream: true },
                });
            });
            if (!response.body) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned no stream.', { status: 502 });
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            try {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    let boundary;
                    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
                        const block = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);
                        for (const line of block.split('\n')) {
                            if (!line.startsWith('data:')) continue;
                            const data = line.slice(5).trim();
                            if (data === '[DONE]') return;
                            try {
                                const payload = JSON.parse(data);
                                const choice = payload?.choices?.[0];
                                if (typeof choice?.delta?.content === 'string' && choice.delta.content) yield { delta: choice.delta.content };
                                if (choice?.finish_reason) yield { finishReason: choice.finish_reason };
                            } catch {
                                throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned a malformed stream event.', { status: 502 });
                            }
                        }
                    }
                }
            } finally {
                await reader.cancel().catch(() => undefined);
            }
        },
    };
    return adapter;
}
