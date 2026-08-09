const DEFAULT_RATE_LIMIT_BLOCK_MS = 15_000;

export interface JikanRateLimitGateOptions {
  defaultBlockMs?: number;
  now?: () => number;
}

export class JikanRateLimitGate {
  private blockedUntil: number | null = null;
  private readonly defaultBlockMs: number;
  private readonly now: () => number;

  constructor(options: JikanRateLimitGateOptions = {}) {
    this.defaultBlockMs = Math.max(
      0,
      options.defaultBlockMs ?? DEFAULT_RATE_LIMIT_BLOCK_MS,
    );
    this.now = options.now ?? Date.now;
  }

  block(retryAfterMs: number | null): void {
    const duration = Math.max(0, retryAfterMs ?? this.defaultBlockMs);
    const nextBlockedUntil = this.now() + duration;
    this.blockedUntil = Math.max(this.blockedUntil ?? 0, nextBlockedUntil);
  }

  isBlocked(): boolean {
    return this.getBlockedUntil() !== null;
  }

  getBlockedUntil(): number | null {
    if (this.blockedUntil !== null && this.now() >= this.blockedUntil) {
      this.blockedUntil = null;
    }
    return this.blockedUntil;
  }

  reset(): void {
    this.blockedUntil = null;
  }
}
