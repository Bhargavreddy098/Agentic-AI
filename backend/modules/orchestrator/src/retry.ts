import type { NormalizedError, ErrorCode } from "@asi/contracts";

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterFactor: number; // 0-1, fraction of delay to use as jitter
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
};

/**
 * Classification of how to handle an error.
 */
export type RetryDecision = 'retry' | 'reconcile' | 'fail';

/**
 * Retryable error codes - these errors may succeed on retry.
 */
const RETRYABLE_CODES: (ErrorCode | string)[] = [
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
  'RATE_LIMITED',
  'TEMPORARY_FAILURE',
  'NETWORK_ERROR',
  'SERVICE_UNAVAILABLE',
];

/**
 * Non-retryable error codes - these errors will not succeed on retry.
 */
const NON_RETRYABLE_CODES: (ErrorCode | string)[] = [
  'INVALID_INPUT',
  'UNAUTHENTICATED',
  'POLICY_DENIED',
  'APPROVAL_REQUIRED',
  'STALE_WRITER',
  'BUDGET_EXCEEDED',
  'TOOL_NOT_FOUND',
  'TOOL_REVOKED',
  'INVALID_SIGNATURE',
  'INSUFFICIENT_CAPABILITIES',
];

/**
 * Unknown outcome codes - these require reconciliation.
 */
const RECONCILE_CODES: ErrorCode[] = [
  'UNKNOWN_OUTCOME',
  'CANCELLED',
];

/**
 * Calculates delay with exponential backoff and jitter.
 */
export function calculateBackoff(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = config.baseDelayMs === 0
    ? 0
    : config.baseDelayMs * Math.pow(2, attempt - 1);
  
  // Cap at maxDelayMs
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  
  // Add jitter: random value between -jitterFactor and +jitterFactor
  const jitterRange = cappedDelay * config.jitterFactor;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  
  return Math.max(0, Math.min(config.maxDelayMs, Math.floor(cappedDelay + jitter)));
}

/**
 * Classifies a normalized error for retry handling.
 * Returns 'retry', 'reconcile', or 'fail'.
 */
export function classifyRetry(
  error: NormalizedError,
  effectId: string
): 'retry' | 'reconcile' | 'fail' {
  const { code, retryable } = error;

  // A misleading retryable flag cannot authorize repeating an uncertain effect.
  if (RECONCILE_CODES.includes(code)) {
    return 'reconcile';
  }

  // Check non-retryable codes
  if (NON_RETRYABLE_CODES.includes(code)) {
    return 'fail';
  }

  if (retryable || RETRYABLE_CODES.includes(code)) {
    return 'retry';
  }

  // Unknown error codes default to reconcile (safer than silent failure)
  // Log the effectId for reconciliation tracking
  console.debug(`Effect ${effectId}: unknown error code ${code}, defaulting to reconcile`);
  return 'reconcile';
}

/**
 * Determines if an error should trigger a circuit breaker.
 */
export function shouldTripCircuitBreaker(
  error: NormalizedError,
  failureCount: number,
  threshold: number = 5
): boolean {
  // Only trip on repeated retryable failures
  if (!RETRYABLE_CODES.includes(error.code)) {
    return false;
  }
  return failureCount >= threshold;
}

/**
 * Creates a retry decision with delay.
 */
export function createRetryDecision(
  error: NormalizedError,
  attempt: number,
  effectId: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): { decision: 'retry' | 'reconcile' | 'fail'; delayMs: number } {
  const decision = classifyRetry(error, effectId);
  
  if (decision === 'retry') {
    if (!Number.isSafeInteger(attempt) || attempt < 1 ||
        !Number.isSafeInteger(config.maxAttempts) || config.maxAttempts < 1 ||
        !Number.isSafeInteger(config.baseDelayMs) || config.baseDelayMs < 0 ||
        !Number.isSafeInteger(config.maxDelayMs) || config.maxDelayMs < 0 ||
        !Number.isFinite(config.jitterFactor) || config.jitterFactor < 0 || config.jitterFactor > 1 ||
        attempt >= config.maxAttempts) {
      return { decision: 'fail', delayMs: 0 };
    }
    const delayMs = calculateBackoff(attempt, config);
    return { decision: 'retry', delayMs };
  }
  
  return { decision, delayMs: 0 };
}
