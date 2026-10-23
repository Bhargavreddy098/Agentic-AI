// @ts-check
import { validateUsage } from './catalog.js';

export class ProviderError extends Error {
    /** @param {string} code @param {string} message @param {{ status?: number, retryable?: boolean }} [options] */
    constructor(code, message, { status = 502, retryable = false } = {}) {
        super(message);
        this.name = 'ProviderError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }
}

export class CircuitBreaker {
    constructor({ threshold = 3, openMs = 60000, now = Date.now } = {}) {
        this.threshold = threshold;
        this.openMs = openMs;
        this.now = now;
        this.failures = 0;
        this.openedAt = null;
        this.halfOpen = false;
    }

    state() {
        if (this.openedAt === null) return 'closed';
        if (this.now() - this.openedAt < this.openMs) return 'open';
        return 'half-open';
    }

    success() {
        this.failures = 0;
        this.openedAt = null;
        this.halfOpen = false;
    }

    failure() {
        this.failures += 1;
        if (this.failures >= this.threshold) this.openedAt = this.now();
    }

    async execute(work) {
        const state = this.state();
        if (state === 'open') throw new ProviderError('PROVIDER_CIRCUIT_OPEN', 'The provider circuit is open after repeated failures.', { status: 503, retryable: true });
        if (state === 'half-open') {
            if (this.halfOpen) throw new ProviderError('PROVIDER_CIRCUIT_OPEN', 'The provider circuit is probing recovery.', { status: 503, retryable: true });
            this.halfOpen = true;
        }
        try {
            const result = await work();
            this.success();
            return result;
        } catch (error) {
            if (!(error instanceof ProviderError) || error.retryable) this.failure();
            else this.success();
            if (state === 'half-open') this.halfOpen = false;
            throw error;
        }
    }
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export function errorFor(status, detail) {
    if (status === 401 || status === 403) return new ProviderError('PROVIDER_AUTH_FAILED', 'Provider credentials were rejected.', { status: 502 });
    if (status === 429) return new ProviderError('PROVIDER_RATE_LIMITED', 'Provider rate limit was reached.', { status: 429, retryable: true });
    if (status >= 500) return new ProviderError('PROVIDER_UNAVAILABLE', 'Provider is temporarily unavailable.', { status: 503, retryable: true });
    return new ProviderError('PROVIDER_REQUEST_REJECTED', detail || 'Provider rejected the request.', { status: 502, retryable: RETRYABLE_STATUS.has(status) });
}

function textFromResponse(body) {
    if (typeof body?.output_text === 'string') return body.output_text;
    for (const item of Array.isArray(body?.output) ? body.output : []) {
        if (item?.type !== 'message') continue;
        for (const part of Array.isArray(item.content) ? item.content : []) {
            if (part?.type === 'output_text' && typeof part.text === 'string') return part.text;
        }
    }
    return '';
}

function usageFromResponse(body) {
    const usage = body?.usage ?? {};
    try { return validateUsage({
        inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, totalTokens: usage.total_tokens,
        cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
        reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    }); } catch { throw new ProviderError('PROVIDER_USAGE_UNKNOWN', 'Provider usage is missing or inconsistent; charges require reconciliation.', { status: 502 }); }
}

/** @param {{ apiKey?: string, fetchImpl?: typeof fetch, baseUrl?: string, timeoutMs?: number }} [options] */
export function createOpenAIAdapter({ apiKey, fetchImpl = globalThis.fetch, baseUrl = 'https://api.openai.com/v1', timeoutMs = 30000 } = {}) {
    if (typeof apiKey !== 'string' || apiKey.length < 20) throw new ProviderError('CREDENTIAL_UNAVAILABLE', 'Provider credentials are not configured.', { status: 503 });
    if (baseUrl !== 'https://api.openai.com/v1') throw new ProviderError('ENDPOINT_NOT_ALLOWED', 'Only the official OpenAI endpoint is approved.', { status: 400 });
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
                response = await fetchImpl(baseUrl + path, {
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
                const input = Array.isArray(messages)
                    ? messages.map(message => ({ role: message.role, content: message.content }))
                    : (prompt ?? '');
                const body = {
                    model,
                    input,
                    max_output_tokens: maxOutputTokens,
                    store: false,
                    ...(model.startsWith('gpt-5') || /^o\d/.test(model) ? { reasoning: { effort: 'minimal' } } : {}),
                    ...(responseSchema ? { text: { format: { type: 'json_schema', name: 'response', strict: true, schema: responseSchema } } } : {}),
                };
                const response = await request('/responses', { method: 'POST', body, signal, deadlineMs });
                let payload;
                try { payload = await response.json(); }
                catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned an invalid response.', { status: 502 }); }
                const text = textFromResponse(payload);
                if (!text) throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned no text content.', { status: 502 });
                return {
                    text,
                    finishReason: payload?.status ?? 'unknown',
                    providerRequestId: response.headers.get('x-request-id') ?? payload?.id ?? null,
                    usage: usageFromResponse(payload),
                    latencyMs: Date.now() - started,
                };
            });
        },
        /** @param {{ model: string, messages?: Array<{role:string,content:string}>, prompt?: string, maxOutputTokens?: number, signal?: AbortSignal, deadlineMs?: number, classification?: string }} input */
        async *stream({ model, messages, prompt, maxOutputTokens = 256, signal, deadlineMs, classification = 'internal' }) {
            if (!['public', 'internal'].includes(classification)) throw new ProviderError('PRIVACY_DENIED', 'This provider cannot receive restricted content.', { status: 403 });
            const response = await breaker.execute(async () => {
                const input = Array.isArray(messages)
                    ? messages.map(message => ({ role: message.role, content: message.content }))
                    : (prompt ?? '');
                return request('/responses', {
                    method: 'POST',
                    signal,
                    deadlineMs,
                    body: {
                        model,
                        input,
                        max_output_tokens: maxOutputTokens,
                        store: false,
                        stream: true,
                        ...(model.startsWith('gpt-5') || /^o\d/.test(model) ? { reasoning: { effort: 'minimal' } } : {}),
                    },
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
                            try { yield JSON.parse(data); }
                            catch { throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned a malformed stream event.', { status: 502 }); }
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
