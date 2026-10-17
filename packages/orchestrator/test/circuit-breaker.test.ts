import { afterEach, describe, expect, it, vi } from "vitest";
import { CircuitBreakerRegistry } from "../src/circuit-breaker.js";

afterEach(() => vi.useRealTimers());

describe("recovery circuit configuration", () => {
  it.each([
    { failureThreshold: NaN }, { failureThreshold: Infinity }, { failureThreshold: 0 },
    { successThreshold: -1 }, { successThreshold: 0.5 }, { timeoutMs: NaN },
    { timeoutMs: -1 }, { halfOpenMaxRequests: 0 }, { halfOpenMaxRequests: Infinity },
  ])("rejects invalid registry configuration %j", config => {
    expect(() => new CircuitBreakerRegistry(config)).toThrow(/circuit.*config/i);
  });

  it("rejects an invalid dependency override", () => {
    const registry = new CircuitBreakerRegistry();
    expect(() => registry.getBreaker("provider", { failureThreshold: NaN })).toThrow(/circuit.*config/i);
    expect(registry.getBreakerIfExists("provider")).toBeUndefined();
  });

  it("applies registry thresholds and timeout to a dependency", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const registry = new CircuitBreakerRegistry({ failureThreshold: 2, timeoutMs: 50, successThreshold: 1 });
    const breaker = registry.getBreaker("provider");
    breaker.recordFailure("TIMEOUT");
    expect(breaker.canExecute()).toBe(true);
    breaker.recordFailure("TIMEOUT");
    expect(breaker.canExecute()).toBe(false);
    vi.advanceTimersByTime(49);
    expect(breaker.canExecute()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(breaker.canExecute()).toBe(true);
    expect(breaker.getState().state).toBe("half-open");
    breaker.recordSuccess();
    expect(breaker.getState().state).toBe("closed");
  });

  it("merges a dependency override with remaining registry defaults", () => {
    vi.useFakeTimers();
    const registry = new CircuitBreakerRegistry({ failureThreshold: 1, timeoutMs: 50 });
    const breaker = registry.getBreaker("provider", { failureThreshold: 2 });
    breaker.recordFailure("TIMEOUT");
    expect(breaker.canExecute()).toBe(true);
    breaker.recordFailure("TIMEOUT");
    expect(breaker.canExecute()).toBe(false);
    vi.advanceTimersByTime(50);
    expect(breaker.canExecute()).toBe(true);
    expect(registry.getBreaker("provider")).toBe(breaker);
  });

  it("reports metrics through the breaker API and resets the existing instance", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const registry = new CircuitBreakerRegistry();
    const breaker = registry.getBreaker("provider");
    breaker.forceOpen();
    vi.advanceTimersByTime(25);
    expect(registry.getAllMetrics()).toEqual([{ dependencyId: "provider", ...breaker.getMetrics() }]);
    expect(registry.getAllMetrics()[0]?.timeInCurrentState).toBe(25);
    registry.resetAll();
    expect(breaker.getState().state).toBe("closed");
  });
});
