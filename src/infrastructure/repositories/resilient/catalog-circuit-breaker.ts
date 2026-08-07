export type CircuitState = 'closed' | 'open' | 'half_open';

export interface CatalogCircuitBreakerOptions {
  failureThreshold?: number;
  openDurationMs?: number;
  now?: () => number;
}

export class CatalogCircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openUntil = 0;
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
    if (this.state === 'open' && this.now() >= this.openUntil) {
      this.state = 'half_open';
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
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.openUntil = 0;
    this.halfOpenProbeInFlight = false;
  }

  recordFailure(): void {
    if (this.getState() === 'half_open') {
      this.open();
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.open();
  }

  recordIgnoredFailure(): void {
    if (this.getState() === 'half_open') this.recordSuccess();
  }

  reset(): void {
    this.recordSuccess();
  }

  private open(): void {
    this.state = 'open';
    this.openUntil = this.now() + this.openDurationMs;
    this.halfOpenProbeInFlight = false;
  }
}
