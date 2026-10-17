

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxRequests: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastErrorCode: string | null;
  nextAttemptTime: number | null;
  lastStateChange: number;
}

export interface CircuitBreakerConfigDefaults {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  halfOpenMaxRequests: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfigDefaults = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000, // 30 seconds
  halfOpenMaxRequests: 3,
};

function resolveConfig(config: Partial<CircuitBreakerConfigDefaults>): CircuitBreakerConfigDefaults {
  const resolved = { ...DEFAULT_CONFIG, ...config };
  for (const key of ["failureThreshold", "successThreshold", "timeoutMs", "halfOpenMaxRequests"] as const) {
    if (!Number.isSafeInteger(resolved[key]) || resolved[key] < 1) {
      throw new Error(`Invalid circuit breaker configuration: ${key}`);
    }
  }
  return resolved;
}

/**
 * Dependency identifiers for circuit breakers.
 */
export type DependencyId = string;

/**
 * Circuit breaker for a single dependency.
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfigDefaults;
  private state: CircuitBreakerState;
  private dependencyId: DependencyId;

  constructor(dependencyId: DependencyId, config: Partial<CircuitBreakerConfigDefaults> = {}) {
    this.dependencyId = dependencyId;
    this.config = resolveConfig(config);
    this.state = this.getInitialState();
  }

  private getInitialState(): CircuitBreakerState {
    return {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastErrorCode: null,
      nextAttemptTime: null,
      lastStateChange: Date.now(),
    };
  }

  /**
   * Records a successful call.
   */
  recordSuccess(): void {
    this.state.failureCount = 0;
    
    if (this.state.state === 'half-open') {
      this.state.successCount++;
      if (this.state.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Records a failed call.
   */
  recordFailure(errorCode: string): void {
    this.state.failureCount++;
    this.state.lastFailureTime = Date.now();
    this.state.lastErrorCode = errorCode;

    if (this.state.state === 'closed') {
      if (this.state.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    } else if (this.state.state === 'half-open') {
      // Any failure in half-open transitions back to open
      this.transitionToOpen();
    }
  }

  /**
   * Checks if a call is allowed.
   */
  canExecute(): boolean {
    const now = Date.now();

    switch (this.state.state) {
      case 'closed':
        return true;
      case 'open':
        if (this.state.nextAttemptTime && now >= this.state.nextAttemptTime) {
          this.transitionToHalfOpen();
          return true;
        }
        return false;
      case 'half-open':
        return true;
      default:
        return false;
    }
  }

  /**
   * Gets the current state.
   */
  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  /**
   * Gets the dependency ID.
   */
  getDependencyId(): string {
    return this.dependencyId;
  }

  /**
   * Forces the circuit to closed state (manual reset).
   */
  reset(): void {
    this.state = this.getInitialState();
  }

  /**
   * Forces the circuit to open state (manual trip).
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  private transitionToOpen(): void {
    this.state.state = 'open';
    this.state.nextAttemptTime = Date.now() + this.config.timeoutMs;
    this.state.lastStateChange = Date.now();
  }

  private transitionToHalfOpen(): void {
    this.state.state = 'half-open';
    this.state.successCount = 0;
    this.state.nextAttemptTime = null;
    this.state.lastStateChange = Date.now();
  }

  private transitionToClosed(): void {
    this.state.state = 'closed';
    this.state.failureCount = 0;
    this.state.successCount = 0;
    this.state.nextAttemptTime = null;
    this.state.lastStateChange = Date.now();
  }

  /**
   * Gets circuit breaker metrics for monitoring.
   */
  getMetrics(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    timeInCurrentState: number;
    failureRate: number;
  } {
    const now = Date.now();
    const timeInCurrentState = now - this.state.lastStateChange;
    const totalCalls = this.state.failureCount + this.state.successCount;
    const failureRate = totalCalls > 0 ? this.state.failureCount / totalCalls : 0;

    return {
      state: this.state.state,
      failureCount: this.state.failureCount,
      successCount: this.state.successCount,
      timeInCurrentState,
      failureRate,
    };
  }
}

/**
 * Registry for managing multiple circuit breakers.
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfigDefaults>;

  constructor(defaultConfig: Partial<CircuitBreakerConfigDefaults> = {}) {
    this.defaultConfig = resolveConfig(defaultConfig);
  }

  /**
   * Gets or creates a circuit breaker for a dependency.
   */
  getBreaker(dependencyId: string, config?: Partial<CircuitBreakerConfigDefaults>): CircuitBreaker {
    let breaker = this.breakers.get(dependencyId);
    if (!breaker) {
      breaker = new CircuitBreaker(dependencyId, { ...this.defaultConfig, ...config });
      this.breakers.set(dependencyId, breaker);
    }
    return breaker;
  }

  /**
   * Gets a circuit breaker if it exists.
   */
  getBreakerIfExists(dependencyId: string): CircuitBreaker | undefined {
    return this.breakers.get(dependencyId);
  }

  /**
   * Removes a circuit breaker.
   */
  removeBreaker(dependencyId: string): boolean {
    return this.breakers.delete(dependencyId);
  }

  /**
   * Gets all circuit breakers.
   */
  getAllBreakers(): CircuitBreaker[] {
    return Array.from(this.breakers.values());
  }

  /**
   * Gets metrics for all circuit breakers.
   */
  getAllMetrics(): Array<{
    dependencyId: string;
    state: string;
    failureCount: number;
    successCount: number;
    timeInCurrentState: number;
    failureRate: number;
  }> {
    return Array.from(this.breakers.entries()).map(([id, breaker]) => {
      const metrics = breaker.getMetrics();
      return {
        dependencyId: id,
        state: metrics.state,
        failureCount: metrics.failureCount,
        successCount: metrics.successCount,
        timeInCurrentState: metrics.timeInCurrentState,
        failureRate: metrics.failureRate,
      };
    });
  }

  /**
   * Resets all circuit breakers.
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Forces all circuit breakers to open (emergency stop).
   */
  forceAllOpen(): void {
    for (const breaker of this.breakers.values()) {
      breaker.forceOpen();
    }
  }
}

/**
 * Global circuit breaker registry instance.
 */
export const globalCircuitBreakerRegistry = new CircuitBreakerRegistry();

export function createCircuitBreakerRegistry(config?: Partial<CircuitBreakerConfigDefaults>): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry(config);
}
