import type { ApiRoute } from './types.ts';

export type Operation = { id: string; idempotencyKey: string | null };

let opCounter = 0;
function genKey() {
  return `idem-${Date.now()}-${++opCounter}-${Math.random().toString(36).slice(2, 10)}`;
}

export function beginOperation(route: ApiRoute): Operation {
  return {
    id: `op-${Date.now()}-${++opCounter}`,
    idempotencyKey: route.idempotencyKeyRequired ? genKey() : null
  };
}

export function buildHeaders(route: ApiRoute, op: Operation, ctx: { csrfToken: string | null; ifMatch?: string } = { csrfToken: null }) {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (route.csrfRequired) {
    if (!ctx.csrfToken) {
      return { headers, refusal: 'CSRF token required' };
    }
    headers['X-CSRF-Token'] = ctx.csrfToken;
  }
  if (route.idempotencyKeyRequired && op.idempotencyKey) {
    headers['Idempotency-Key'] = op.idempotencyKey;
  }
  if (route.ifMatchRequired) {
    if (!ctx.ifMatch) {
      return { headers, refusal: 'If-Match required' };
    }
    headers['If-Match'] = ctx.ifMatch;
  }
  return { headers };
}
