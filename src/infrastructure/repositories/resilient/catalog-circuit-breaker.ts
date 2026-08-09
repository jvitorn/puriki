export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CircuitSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  openUntil: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
}

export interface CatalogCircuitBreakerOptions {
  failureThreshold?: number;
  openDurationMs?: number;
  now?: () => number;
}

export class CatalogCircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openUntil: number | null = null;
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private halfOpenProbeInFlight = false;
  private readonly failureThreshold: number;
  private readonly openDurationMs: number;
  private readonly now: () => number;

  constructor(options: CatalogCircuitBreakerOptions = {}) {
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 2);
    this.openDurationMs = Math.max(0, options.openDurationMs ?? 5 * 60_000);
    this.now = options.now ?? Date.now;
  }

  getState(): CircuitState {
    if (
      this.state === 'open' &&
      this.openUntil !== null &&
      this.now() >= this.openUntil
    ) {
      this.state = 'half_open';
      this.openUntil = null;
      this.halfOpenProbeInFlight = false;
    }
    return this.state;
  }

  allowRequest(): boolean {
    const state = this.getState();
    if (state === 'closed') return true;
    if (state === 'open' || this.halfOpenProbeInFlight) return false;
    this.halfOpenProbeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.close();
    this.lastSuccessAt = this.now();
  }

  recordFailure(): void {
    this.lastFailureAt = this.now();
    if (this.getState() === 'half_open') {
      this.open();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.open();
  }

  recordIgnoredFailure(): void {
    if (this.getState() === 'half_open') this.close();
  }

  reset(): void {
    this.close();
    this.lastFailureAt = null;
    this.lastSuccessAt = null;
  }

  getSnapshot(): CircuitSnapshot {
    return {
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      openUntil: this.openUntil,
      lastFailureAt: this.lastFailureAt,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  private open(): void {
    this.state = 'open';
    this.openUntil = this.now() + this.openDurationMs;
    this.halfOpenProbeInFlight = false;
  }

  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openUntil = null;
    this.halfOpenProbeInFlight = false;
  }
}
