import { AniListRateLimitError } from '@/infrastructure/api/anilist/anilist-errors';
import type { AniListRateLimitMetrics } from '@/infrastructure/api/anilist/anilist-errors';

export interface AniListRequestCoordinatorOptions {
  defaultBlockMs?: number;
  maximumConcurrent?: number;
  now?: () => number;
}

export interface AniListRequestBudgetSnapshot extends AniListRateLimitMetrics {
  blockedUntil: number | null;
}

export class AniListRequestCoordinator {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly rateLimitObservers = new Set<
    (retryAfterMs: number) => void
  >();
  private readonly waiters: (() => void)[] = [];
  private active = 0;
  private blockedUntil: number | null = null;
  private limit: number | null = null;
  private remaining: number | null = null;
  private resetAt: number | null = null;
  private readonly maximumConcurrent: number;
  private readonly defaultBlockMs: number;
  private readonly now: () => number;

  constructor(options: AniListRequestCoordinatorOptions = {}) {
    this.maximumConcurrent = Math.max(1, options.maximumConcurrent ?? 2);
    this.defaultBlockMs = Math.max(0, options.defaultBlockMs ?? 15_000);
    this.now = options.now ?? Date.now;
  }

  schedule<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const request = this.run(operation);
    this.inFlight.set(key, request);
    void request.then(
      () => this.deleteIfCurrent(key, request),
      () => this.deleteIfCurrent(key, request),
    );
    return request;
  }

  observeRateLimit(metrics: AniListRateLimitMetrics): void {
    if (metrics.limit !== null) this.limit = metrics.limit;
    if (metrics.remaining !== null) this.remaining = metrics.remaining;
    if (metrics.resetAt !== null) this.resetAt = metrics.resetAt;
    if (metrics.retryAfterSeconds !== null || metrics.remaining === 0) {
      this.block(
        metrics.retryAfterSeconds === null
          ? null
          : metrics.retryAfterSeconds * 1_000,
        metrics.resetAt,
      );
    }
  }

  subscribeRateLimit(observer: (retryAfterMs: number) => void): () => void {
    this.rateLimitObservers.add(observer);
    return () => this.rateLimitObservers.delete(observer);
  }

  block(retryAfterMs: number | null, resetAt: number | null): void {
    const resetAtMs =
      resetAt === null
        ? 0
        : resetAt < 1_000_000_000_000
          ? resetAt * 1_000
          : resetAt;
    const retryAt = retryAfterMs === null ? 0 : this.now() + retryAfterMs;
    const next = Math.max(
      resetAtMs,
      retryAt,
      resetAtMs === 0 && retryAt === 0 ? this.now() + this.defaultBlockMs : 0,
    );
    if (next > 0) {
      this.blockedUntil = Math.max(this.blockedUntil ?? 0, next);
      const duration = Math.max(0, this.blockedUntil - this.now());
      this.rateLimitObservers.forEach((observer) => observer(duration));
    }
  }

  getSnapshot(): AniListRequestBudgetSnapshot {
    return {
      limit: this.limit,
      remaining: this.remaining,
      retryAfterSeconds:
        this.getBlockedUntil() === null
          ? null
          : Math.max(
              0,
              Math.ceil(
                ((this.getBlockedUntil() as number) - this.now()) / 1_000,
              ),
            ),
      resetAt: this.resetAt,
      blockedUntil: this.getBlockedUntil(),
    };
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    const blockedUntil = this.getBlockedUntil();
    if (blockedUntil !== null) {
      throw new AniListRateLimitError(
        Math.max(0, blockedUntil - this.now()),
        'AniList requests are paused by the shared rate-limit coordinator.',
      );
    }
    await this.acquire();
    try {
      const blockedAfterQueue = this.getBlockedUntil();
      if (blockedAfterQueue !== null) {
        throw new AniListRateLimitError(
          Math.max(0, blockedAfterQueue - this.now()),
          'AniList requests are paused by the shared rate-limit coordinator.',
        );
      }
      return await operation();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.maximumConcurrent) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.waiters.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release(): void {
    this.active -= 1;
    this.waiters.shift()?.();
  }

  private getBlockedUntil(): number | null {
    if (this.blockedUntil !== null && this.now() >= this.blockedUntil) {
      this.blockedUntil = null;
    }
    return this.blockedUntil;
  }

  private deleteIfCurrent(key: string, request: Promise<unknown>): void {
    if (this.inFlight.get(key) === request) this.inFlight.delete(key);
  }
}
