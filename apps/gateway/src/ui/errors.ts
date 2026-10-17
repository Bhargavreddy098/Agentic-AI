import type { ErrorCode, NormalizedError } from "@asi/contracts";

export function normalizedError(code: ErrorCode, safeMessage: string, retryable = false): NormalizedError {
  return { code, safeMessage, retryable };
}
