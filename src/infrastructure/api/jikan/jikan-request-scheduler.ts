import { JIKAN_REQUEST_POLICY } from '@/infrastructure/api/jikan/jikan-config';
import { JikanRateLimitError } from '@/infrastructure/api/jikan/jikan-errors';

export type SchedulerSleep = (milliseconds: number) => Promise<void>;
export type SchedulerClock = () => number;

const defaultSleep: SchedulerSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface JikanRequestSchedulerOptions {
  requestIntervalMs?: number;
  sustainedRequestLimit?: number;
  sustainedWindowMs?: number;
  retryAfterFallbackMs?: number;
  now?: SchedulerClock;
  sleep?: SchedulerSleep;
}

interface SchedulerState {
  gate: Promise<void>;
  nextStartAt: number;
  recentStarts: number[];
  blockedUntil: number;
}

export class JikanRequestScheduler {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private state: SchedulerState = {
    gate: Promise.resolve(),
    nextStartAt: 0,
    recentStarts: [],
    blockedUntil: 0,
  };
  private readonly requestIntervalMs: number;
  private readonly sustainedRequestLimit: number;
  private readonly sustainedWindowMs: number;
  private readonly retryAfterFallbackMs: number;
  private readonly now: SchedulerClock;
  private readonly sleep: SchedulerSleep;

  constructor(options: JikanRequestSchedulerOptions = {}) {
    this.requestIntervalMs = Math.max(
      0,
      options.requestIntervalMs ?? JIKAN_REQUEST_POLICY.requestIntervalMs,
    );
    this.sustainedRequestLimit = Math.max(
      1,
      Math.floor(
        options.sustainedRequestLimit ??
          JIKAN_REQUEST_POLICY.sustainedRequestLimit,
      ),
    );
    this.sustainedWindowMs = Math.max(
      1,
      options.sustainedWindowMs ?? JIKAN_REQUEST_POLICY.sustainedWindowMs,
    );
    this.retryAfterFallbackMs = Math.max(
      0,
      options.retryAfterFallbackMs ?? JIKAN_REQUEST_POLICY.retryAfterFallbackMs,
    );
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  schedule<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const state = this.state;
    const request = state.gate.then(async () => {
      const now = this.now();
      this.pruneRecentStarts(state, now);
      const oldestStart = state.recentStarts[0];
      const sustainedWait =
        state.recentStarts.length >= this.sustainedRequestLimit &&
        oldestStart !== undefined
          ? oldestStart + this.sustainedWindowMs - now
          : 0;
      const waitMs = Math.max(
        0,
        state.nextStartAt - now,
        state.blockedUntil - now,
        sustainedWait,
      );
      if (waitMs > 0) await this.sleep(waitMs);
      const startedAt = this.now();
      this.pruneRecentStarts(state, startedAt);
      state.nextStartAt =
        Math.max(state.nextStartAt, startedAt) + this.requestIntervalMs;
      state.recentStarts.push(startedAt);
      if (process.env.NODE_ENV === 'development') {
        console.info('[Jikan] request started', {
          key,
          timestamp: new Date().toISOString(),
        });
      }
      try {
        return await operation();
      } catch (error: unknown) {
        if (error instanceof JikanRateLimitError) {
          const duration = Math.max(
            0,
            error.retryAfterMs ?? this.retryAfterFallbackMs,
          );
          state.blockedUntil = Math.max(
            state.blockedUntil,
            this.now() + duration,
          );
        }
        throw error;
      }
    });
    state.gate = request.then(
      () => undefined,
      () => undefined,
    );

    this.inFlight.set(key, request);
    void request.then(
      () => this.deleteIfCurrent(key, request),
      () => this.deleteIfCurrent(key, request),
    );
    return request;
  }

  clear(): void {
    this.inFlight.clear();
    this.state = {
      gate: Promise.resolve(),
      nextStartAt: 0,
      recentStarts: [],
      blockedUntil: 0,
    };
  }

  private pruneRecentStarts(state: SchedulerState, now: number): void {
    const cutoff = now - this.sustainedWindowMs;
    while (
      state.recentStarts[0] !== undefined &&
      (state.recentStarts[0] as number) <= cutoff
    ) {
      state.recentStarts.shift();
    }
  }

  private deleteIfCurrent(key: string, request: Promise<unknown>): void {
    if (this.inFlight.get(key) === request) this.inFlight.delete(key);
  }
}
