import { AniListDiagnosticCoordinator } from '@/infrastructure/api/anilist/anilist-diagnostic-coordinator';

describe('AniListDiagnosticCoordinator', () => {
  it('serializes concurrent callers and spaces request starts', async () => {
    let now = 1_000;
    let active = 0;
    let maxActive = 0;
    const starts: number[] = [];
    const sleep = jest.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const coordinator = new AniListDiagnosticCoordinator({
      spacingMs: 2_000,
      now: () => now,
      sleep,
    });
    let releaseFirst: (() => void) | undefined;
    const first = coordinator.schedule(async () => {
      starts.push(now);
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      active -= 1;
      return 'first';
    });
    const second = coordinator.schedule(async () => {
      starts.push(now);
      active += 1;
      maxActive = Math.max(maxActive, active);
      active -= 1;
      return 'second';
    });

    await Promise.resolve();
    expect(starts).toEqual([1_000]);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([
      'first',
      'second',
    ]);
    expect(maxActive).toBe(1);
    expect(starts).toEqual([1_000, 3_000]);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('continues the queue after a failed operation and clamps negative spacing', async () => {
    const coordinator = new AniListDiagnosticCoordinator({
      spacingMs: -1,
      sleep: jest.fn(async () => undefined),
    });
    const first = coordinator.schedule(async () => {
      throw new Error('failed');
    });
    const second = coordinator.schedule(async () => 'continued');
    await expect(first).rejects.toThrow('failed');
    await expect(second).resolves.toBe('continued');
  });

  it('respects Retry-After and Unix reset headers before a later manual run', async () => {
    let now = 10_000;
    const sleep = jest.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const coordinator = new AniListDiagnosticCoordinator({
      spacingMs: 2_000,
      now: () => now,
      sleep,
    });
    coordinator.respectRateLimit({
      retryAfterSeconds: 8,
      resetAt: 21,
    });
    await expect(coordinator.schedule(async () => 'started')).resolves.toBe(
      'started',
    );
    expect(sleep).toHaveBeenCalledWith(11_000);
  });
});
