export type SchedulerSleep = (milliseconds: number) => Promise<void>;
export type SchedulerClock = () => number;

const defaultSleep: SchedulerSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export interface JikanRequestSchedulerOptions {
  requestIntervalMs?: number;
  now?: SchedulerClock;
  sleep?: SchedulerSleep;
}

interface SchedulerState {
  gate: Promise<void>;
  nextStartAt: number;
}

export class JikanRequestScheduler {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private state: SchedulerState = {
    gate: Promise.resolve(),
    nextStartAt: 0,
  };
  private readonly requestIntervalMs: number;
  private readonly now: SchedulerClock;
  private readonly sleep: SchedulerSleep;

  constructor(options: JikanRequestSchedulerOptions = {}) {
    this.requestIntervalMs = options.requestIntervalMs ?? 500;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  schedule<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const state = this.state;
    const request = state.gate.then(async () => {
      const waitMs = Math.max(0, state.nextStartAt - this.now());
      if (waitMs > 0) await this.sleep(waitMs);
      state.nextStartAt =
        Math.max(state.nextStartAt, this.now()) + this.requestIntervalMs;
      if (process.env.NODE_ENV === 'development') {
        console.info('[Jikan] request started', {
          key,
          timestamp: new Date().toISOString(),
        });
      }
      return operation();
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
    };
  }

  private deleteIfCurrent(key: string, request: Promise<unknown>): void {
    if (this.inFlight.get(key) === request) this.inFlight.delete(key);
  }
}
