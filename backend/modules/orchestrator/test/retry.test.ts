import { afterEach, describe, expect, it, vi } from "vitest";
import type { NormalizedError } from "@asi/contracts";
import { classifyRetry, createRetryDecision } from "../src/retry.js";

afterEach(() => vi.restoreAllMocks());

describe("bounded recovery retry", () => {
  it("reconciles an unknown external outcome even when marked retryable", () => {
    expect(classifyRetry({ code: "UNKNOWN_OUTCOME", safeMessage: "uncertain", retryable: true }, "effect-1")).toBe("reconcile");
  });

  it.each(["INVALID_INPUT", "UNAUTHENTICATED", "POLICY_DENIED", "APPROVAL_REQUIRED", "STALE_WRITER", "BUDGET_EXCEEDED"] as const)("never retries %s based on a misleading flag", code => {
    expect(classifyRetry({ code, safeMessage: "denied", retryable: true }, "effect-1")).toBe("fail");
  });

  it("reconciles cancellation even when marked retryable", () => {
    expect(classifyRetry({ code: "CANCELLED", safeMessage: "cancelled", retryable: true }, "effect-1")).toBe("reconcile");
  });

  const timeout: NormalizedError = { code: "TIMEOUT", safeMessage: "timeout", retryable: true };
  const config = { maxAttempts: 3, baseDelayMs: 70, maxDelayMs: 100, jitterFactor: 0 };

  it("uses the supplied backoff bounds", () => {
    expect(createRetryDecision(timeout, 1, "effect-1", config)).toEqual({ decision: "retry", delayMs: 70 });
    expect(createRetryDecision(timeout, 2, "effect-1", config)).toEqual({ decision: "retry", delayMs: 100 });
  });

  it("keeps positive jitter within the configured maximum delay", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999);
    expect(createRetryDecision(timeout, 2, "effect-1", { ...config, jitterFactor: 1 })).toEqual({ decision: "retry", delayMs: 100 });
  });

  it("keeps zero delay finite after a large valid attempt", () => {
    expect(createRetryDecision(timeout, 1025, "effect-1", { ...config, baseDelayMs: 0, maxAttempts: 1026 })).toEqual({ decision: "retry", delayMs: 0 });
  });

  it("stops after the last configured attempt", () => {
    expect(createRetryDecision(timeout, 3, "effect-1", config)).toEqual({ decision: "fail", delayMs: 0 });
    expect(createRetryDecision(timeout, 4, "effect-1", config)).toEqual({ decision: "fail", delayMs: 0 });
  });

  it("preserves reconciliation at the retry limit", () => {
    expect(createRetryDecision({ ...timeout, code: "UNKNOWN_OUTCOME" }, 3, "effect-1", config)).toEqual({ decision: "reconcile", delayMs: 0 });
  });

  it.each([0, -1, 1.5, NaN, Infinity])("rejects invalid attempt %s", attempt => {
    expect(createRetryDecision(timeout, attempt, "effect-1", config)).toEqual({ decision: "fail", delayMs: 0 });
  });

  it.each([
    { maxAttempts: Infinity }, { maxAttempts: 0 }, { baseDelayMs: -1 },
    { maxDelayMs: NaN }, { jitterFactor: 2 }, { jitterFactor: -0.1 },
  ])("rejects invalid retry configuration %j", invalid => {
    expect(createRetryDecision(timeout, 1, "effect-1", { ...config, ...invalid })).toEqual({ decision: "fail", delayMs: 0 });
  });
});
