export const ANILIST_DIAGNOSTIC_SPACING_MS = 2_000;

export interface AniListDiagnosticCoordinatorOptions {
  spacingMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class AniListDiagnosticCoordinator {
  private tail: Promise<void> = Promise.resolve();
  private lastStartedAt: number | null = null;
  private rateLimitedUntil = 0;
  private readonly spacingMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(options: AniListDiagnosticCoordinatorOptions = {}) {
    this.spacingMs = Math.max(
      0,
      options.spacingMs ?? ANILIST_DIAGNOSTIC_SPACING_MS,
    );
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  schedule<T>(operation: () => Promise<T>): Promise<T> {
    const scheduled = this.tail.then(async () => {
      const now = this.now();
      const spacingWait =
        this.lastStartedAt === null
          ? 0
          : this.spacingMs - (now - this.lastStartedAt);
      const rateLimitWait = this.rateLimitedUntil - now;
      const wait = Math.max(0, spacingWait, rateLimitWait);
      if (wait > 0) await this.sleep(wait);
      this.lastStartedAt = this.now();
      return operation();
    });
    this.tail = scheduled.then(
      () => undefined,
      () => undefined,
    );
    return scheduled;
  }

  respectRateLimit({
    resetAt,
    retryAfterSeconds,
  }: {
    resetAt: number | null;
    retryAfterSeconds: number | null;
  }): void {
    const now = this.now();
    const retryAt =
      retryAfterSeconds === null ? 0 : now + retryAfterSeconds * 1_000;
    const normalizedResetAt =
      resetAt === null
        ? 0
        : resetAt < 1_000_000_000_000
          ? resetAt * 1_000
          : resetAt;
    this.rateLimitedUntil = Math.max(
      this.rateLimitedUntil,
      retryAt,
      normalizedResetAt,
    );
  }
}
