import { computeDigest } from '../models/_shared.js';

export class ServiceClientError extends Error {
    constructor(code, message, status = 503, retryable = false) {
        super(message);
        this.name = 'ServiceClientError';
        this.code = code;
        this.status = status;
        this.retryable = retryable;
    }
}

/**
 * Bounded typed HTTP client for inter-service calls.
 * Never forwards browser cookies or raw authorization headers.
 */
export function createServiceClient({
    callerService,
    targetAudience,
    baseUrl,
    serviceToken = 'asi-local-service-token-2026',
    timeoutMs = 5000,
    maxResponseBytes = 524288,
    contractVersion = '1',
    fetchImpl = globalThis.fetch,
}) {
    if (!callerService || !targetAudience || !baseUrl) {
        throw new Error('createServiceClient requires callerService, targetAudience, and baseUrl.');
    }
    const cleanBase = baseUrl.replace(/\/+$/, '');

    /**
     * @param {string} method
     * @param {string} path
     * @param {any} [options]
     */
    async function request(method, path, { context, body, query, responseSchema, signal, commandId } = {}) {
        if (!context?.tenantId) {
            throw new ServiceClientError('UNAUTHORIZED_TENANT', 'Tenant context is required for inter-service call.', 403, false);
        }
        const url = new URL(cleanBase + (path.startsWith('/') ? path : '/' + path));
        if (query && typeof query === 'object') {
            for (const [k, v] of Object.entries(query)) {
                if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
            }
        }

        const headers = {
            'accept': 'application/json',
            'x-asi-service-id': callerService,
            'x-asi-audience': targetAudience,
            'x-asi-tenant-id': context.tenantId,
            'x-asi-contract-version': contractVersion,
            'x-asi-service-token': serviceToken,
        };
        if (context.principalId) headers['x-asi-principal-id'] = context.principalId;
        if (context.agentId) headers['x-asi-agent-id'] = context.agentId;
        if (Array.isArray(context.roleIds) && context.roleIds.length > 0) {
            headers['x-asi-role-ids'] = context.roleIds.join(',');
        }
        if (Array.isArray(context.requestedScopes) && context.requestedScopes.length > 0) {
            headers['x-asi-scopes'] = context.requestedScopes.join(',');
        }
        if (commandId || context.commandId) {
            headers['x-asi-command-id'] = String(commandId ?? context.commandId);
        }
        if (context.now) {
            headers['x-asi-now'] = String(context.now);
        }

        let serializedBody;
        if (body !== undefined) {
            serializedBody = JSON.stringify(body);
            headers['content-type'] = 'application/json';
            headers['x-asi-payload-digest'] = computeDigest(body);
        }

        const timeoutSignal = AbortSignal.timeout(timeoutMs);
        const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

        let res;
        try {
            res = await fetchImpl(url, {
                method,
                headers,
                body: serializedBody,
                signal: combinedSignal,
            });
        } catch (err) {
            const isAbort = err?.name === 'AbortError' || err?.name === 'TimeoutError';
            throw new ServiceClientError(
                isAbort ? 'UPSTREAM_TIMEOUT' : 'DEPENDENCY_UNAVAILABLE',
                isAbort ? `Upstream ${targetAudience} timed out.` : `Upstream ${targetAudience} is unreachable.`,
                503,
                method === 'GET'
            );
        }

        const rawText = await res.text();
        if (Buffer.byteLength(rawText, 'utf8') > maxResponseBytes) {
            throw new ServiceClientError('RESPONSE_TOO_LARGE', `Upstream ${targetAudience} response exceeded ${maxResponseBytes} bytes.`, 502, false);
        }

        let payload = null;
        if (rawText.length > 0) {
            try {
                payload = JSON.parse(rawText);
            } catch {
                throw new ServiceClientError('INVALID_UPSTREAM_JSON', `Upstream ${targetAudience} returned malformed JSON.`, 502, false);
            }
        }

        if (!res.ok) {
            const code = payload?.error?.code ?? 'UPSTREAM_ERROR';
            const message = payload?.error?.message ?? `Upstream ${targetAudience} returned HTTP ${res.status}.`;
            throw new ServiceClientError(code, message, res.status, res.status === 503);
        }

        if (responseSchema) {
            const validated = responseSchema.safeParse(payload);
            if (!validated.success) {
                throw new ServiceClientError('INVALID_UPSTREAM_CONTRACT', `Upstream ${targetAudience} response failed schema validation.`, 502, false);
            }
            return validated.data;
        }
        return payload;
    }

    return {
        request,
        get: (path, opts) => request('GET', path, opts),
        post: (path, body, opts = {}) => request('POST', path, { ...opts, body }),
        put: (path, body, opts = {}) => request('PUT', path, { ...opts, body }),
        patch: (path, body, opts = {}) => request('PATCH', path, { ...opts, body }),
    };
}
