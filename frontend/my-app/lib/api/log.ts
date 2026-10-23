import type { RequestLogRecord } from './types.ts';

export const SENSITIVE_KEYS = ['cookie', 'set-cookie', 'authorization', 'x-csrf-token', 'idempotency-key', 'challenge', 'clientNonce', 'csrfToken', 'secretReferenceId', 'apiKey', 'DATABASE_URL', 'password'];

export function redactPath(path: string): string {
  return path.replace(/\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '/:param')
             .replace(/\/[A-Za-z0-9_-]{20,}/g, '/:param');
}

export function makeRecord(input: any): RequestLogRecord {
  const rec: RequestLogRecord = {
    id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    method: input.method,
    pathTemplate: redactPath(input.path),
    status: input.status,
    latencyMs: input.latencyMs
  };
  if (input.requestId) rec.requestId = input.requestId;
  if (input.contentType) rec.contentType = input.contentType;
  return rec;
}
