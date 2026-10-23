import type { ProblemDetails } from './types.ts';

const DEFAULT_TITLES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'DEPENDENCY_UNAVAILABLE'
};

export function parseProblem(status: number, body: unknown): ProblemDetails {
  const b: any = body || {};
  // A rewrite/proxy failure returns a non-JSON body; fall back to the status,
  // never to a blank "UNKNOWN".
  const fallback = DEFAULT_TITLES[status] ?? `HTTP_${status}`;
  const code = b.code || b.title || fallback;
  const title = b.title || code;
  const detail = b.detail || (status >= 500 && !b.code ? 'Backend unreachable or returned an unexpected response.' : undefined);
  const retryable = typeof b.retryable === 'boolean' ? b.retryable : (status >= 500 || status === 429);
  const requestId = b.requestId || b.meta?.requestId;
  return { code, title, status, detail, retryable, requestId };
}
