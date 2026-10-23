import type { ProblemDetails } from './types.ts';

export function parseProblem(status: number, body: unknown): ProblemDetails {
  const b: any = body || {};
  const code = b.code || b.title || 'UNKNOWN';
  const title = b.title || code;
  const detail = b.detail;
  const retryable = typeof b.retryable === 'boolean' ? b.retryable : (status >= 500 || status === 429);
  const requestId = b.requestId || b.meta?.requestId;
  return { code, title, status, detail, retryable, requestId };
}
