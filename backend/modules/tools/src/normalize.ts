import type { NormalizedError } from "@asi/contracts";

export type ErrorCode = NormalizedError["code"];

export const ErrorNormalizationCodes: ErrorCode[] = [
  "INVALID_INPUT",
  "UNAUTHENTICATED",
  "POLICY_DENIED",
  "APPROVAL_REQUIRED",
  "STALE_WRITER",
  "BUDGET_EXCEEDED",
  "TIMEOUT",
  "CANCELLED",
  "DEPENDENCY_UNAVAILABLE",
  "UNKNOWN_OUTCOME",
];

export interface NormalizationContext {
  operation: string;
  toolId?: string;
  runId?: string;
  traceId?: string;
}

export function normalizeError(
  error: unknown,
  context: NormalizationContext
): NormalizedError {
  // Handle already normalized error
  if (error && typeof error === "object" && "code" in error && "safeMessage" in error && "retryable" in error) {
    return error as NormalizedError;
  }

  if (error instanceof Error) {
    return normalizeKnownError(error, context);
  }

  if (typeof error === "string") {
    return {
      code: "UNKNOWN_OUTCOME",
      safeMessage: error.substring(0, 1024),
      retryable: false,
    };
  }

  if (error && typeof error === "object" && "message" in error) {
    return normalizeKnownError(error as Error, context);
  }

  return {
    code: "UNKNOWN_OUTCOME",
    safeMessage: "An unknown error occurred",
    retryable: false,
  };
}

function normalizeKnownError(error: Error, context: NormalizationContext): NormalizedError {
  // Map common error types to normalized codes
  const errorMappings: Record<string, { code: NormalizedError["code"]; retryable: boolean }> = {
    "ValidationError": { code: "INVALID_INPUT", retryable: false },
    "UnauthorizedError": { code: "UNAUTHENTICATED", retryable: false },
    "BudgetExhaustedError": { code: "BUDGET_EXCEEDED", retryable: false },
    "NotFoundError": { code: "INVALID_INPUT", retryable: false },
    "RevokedError": { code: "POLICY_DENIED", retryable: false },
    "TimeoutError": { code: "TIMEOUT", retryable: true },
    "AbortError": { code: "CANCELLED", retryable: false },
    "PolicyDeniedError": { code: "POLICY_DENIED", retryable: false },
    "CapabilityMismatchError": { code: "POLICY_DENIED", retryable: false },
  };

  const errorName = error.constructor.name;
  const mapping = errorMappings[errorName];

  if (mapping) {
    return {
      code: mapping.code,
      safeMessage: sanitizeMessage(error.message),
      retryable: mapping.retryable,
      detailsRef: context.traceId ? createDetailsRef(context) : undefined,
    };
  }

  // Check for specific error messages
  const message = error.message.toLowerCase();
  if (message.includes("timeout") || message.includes("timed out")) {
    return {
      code: "TIMEOUT",
      safeMessage: sanitizeMessage(error.message),
      retryable: true,
    };
  }
  if (message.includes("cancelled") || message.includes("aborted")) {
    return {
      code: "CANCELLED",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }
  if (message.includes("budget") || message.includes("quota")) {
    return {
      code: "BUDGET_EXCEEDED",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }
  if (message.includes("unauthorized") || message.includes("forbidden") || message.includes("permission denied")) {
    return {
      code: "UNAUTHENTICATED",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }
  if (message.includes("not found")) {
    return {
      code: "INVALID_INPUT",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }
  if (message.includes("validation") || message.includes("invalid input")) {
    return {
      code: "INVALID_INPUT",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }
  if (message.includes("policy") || message.includes("denied")) {
    return {
      code: "POLICY_DENIED",
      safeMessage: sanitizeMessage(error.message),
      retryable: false,
    };
  }

  // Default to unknown outcome
  return {
    code: "UNKNOWN_OUTCOME",
    safeMessage: sanitizeMessage(error.message),
    retryable: true,
    detailsRef: context.traceId ? createDetailsRef(context) : undefined,
  };
}

function sanitizeMessage(message: string): string {
  // Remove sensitive information from error messages
  return message
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
    .replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CREDIT_CARD]")
    .replace(/(api[_-]?key|secret|token|password)\s*[:=]\s*[^\s]+/gi, "$1=[REDACTED]")
    .replace(/\b(sk|pk|rk|ak|apikey|api[_-]?key|secret|token)[_-]?[A-Za-z0-9]{20,}\b/gi, "[REDACTED]")
    .substring(0, 1024);
}

function createDetailsRef(context: NormalizationContext): string {
  return `error-details-${context.traceId || context.runId || "unknown"}`;
}

export function createNormalizedError(
  code: NormalizedError["code"],
  message: string,
  retryable: boolean = false,
  detailsRef?: string
): NormalizedError {
  return {
    code,
    safeMessage: sanitizeMessage(message),
    retryable,
    detailsRef,
  };
}

export function isRetryableError(error: NormalizedError): boolean {
  return error.retryable;
}

export function isFatalError(error: NormalizedError): boolean {
  const fatalCodes: NormalizedError["code"][] = [
    "UNAUTHENTICATED",
    "POLICY_DENIED",
    "APPROVAL_REQUIRED",
    "STALE_WRITER",
  ];
  return fatalCodes.includes(error.code);
}