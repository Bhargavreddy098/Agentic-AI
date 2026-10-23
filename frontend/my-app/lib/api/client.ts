import type { ApiRoute, ApiResult } from './types.ts';
import { buildHeaders, beginOperation, type Operation } from './requirements.ts';
import { unwrapEnvelope } from './envelope.ts';
import { parseProblem } from './problem.ts';
import { makeRecord } from './log.ts';

function buildUrl(route: ApiRoute, pathParams?: Record<string, string>, query?: Record<string, string>) {
  let url = route.canonicalRoute;
  if (route.canonicalRoute.startsWith('/api/v1')) {
    url = route.canonicalRoute;
  } else if (route.path.startsWith('/health')) {
    url = route.path;
  }
  if (pathParams) {
    for (const [k, v] of Object.entries(pathParams)) {
      url = url.replace(`:${k}`, encodeURIComponent(v));
    }
  }
  if (query) {
    const qs = new URLSearchParams(query as any).toString();
    if (qs) url += '?' + qs;
  }
  return url;
}

export function createClient({ transport = fetch as any, getCsrfToken = () => null, onUnauthorized = () => {}, onLog = (_: any) => {}, maxRetries = 2 }: any = {}) {
  return {
    async request<T>(route: ApiRoute, opts: any = {}): Promise<ApiResult<T>> {
      const op = opts.operation || beginOperation(route);
      let lastErr: any;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const start = Date.now();
        const { headers, refusal } = buildHeaders(route, op, { csrfToken: getCsrfToken(), ifMatch: opts.ifMatch });
        if (refusal) {
          return { ok: false, problem: parseProblem(400, { code: 'BAD_REQUEST', title: refusal, detail: refusal }) };
        }
        // Raw byte bodies must reach the server untouched: the upload route
        // reads express.raw(), so JSON.stringify would corrupt the payload.
        const isRaw = opts.rawBody instanceof Uint8Array || opts.rawBody instanceof ArrayBuffer || (opts.rawBody && typeof opts.rawBody === 'object' && 'byteLength' in opts.rawBody);
        if (isRaw) {
          headers['Content-Type'] = 'application/octet-stream';
        } else if (opts.body !== undefined && !headers['Content-Type'] && !(opts.body instanceof FormData)) {
          headers['Content-Type'] = 'application/json';
        }
        try {
          const res = await transport(buildUrl(route, opts.pathParams, opts.query), {
            method: route.method,
            credentials: 'include',
            headers,
            body: isRaw
              ? opts.rawBody
              : opts.body instanceof FormData
                ? opts.body
                : opts.body !== undefined
                  ? JSON.stringify(opts.body)
                  : undefined,
            signal: opts.signal
          });
          const latencyMs = Date.now() - start;
          if (res.status === 401) {
            onUnauthorized();
            return { ok: false, problem: parseProblem(401, {}) };
          }
          if (!res.ok) {
            let body: any;
            try { body = await res.json(); } catch { body = {}; }
            const problem = parseProblem(res.status, body);
            onLog(makeRecord({ method: route.method, path: route.canonicalRoute, status: res.status, latencyMs, requestId: problem.requestId }));
            if (problem.retryable && attempt < maxRetries && op.idempotencyKey) {
              continue;
            }
            return { ok: false, problem };
          }
          const unwrapped = await unwrapEnvelope(route.responseEnvelope, res);
          let requestId: string | undefined;
          try { requestId = res.headers?.get?.('x-request-id') || res.headers?.get?.('X-Request-Id'); } catch {}
          onLog(makeRecord({ method: route.method, path: route.canonicalRoute, status: res.status, latencyMs, requestId }));
          return { ok: true, data: unwrapped.data as T, status: res.status, meta: unwrapped.meta };
        } catch (e) {
          lastErr = e;
          if (attempt < maxRetries && op.idempotencyKey) continue;
          onLog(makeRecord({ method: route.method, path: route.canonicalRoute, status: 0, latencyMs: Date.now() - start }));
          return { ok: false, problem: parseProblem(503, { code: 'NETWORK_ERROR', title: 'Network error', detail: String(e) }) };
        }
      }
      return { ok: false, problem: parseProblem(503, { code: 'NETWORK_ERROR', title: 'Network error' }) };
    }
  };
}
