import { AniListRateLimitError } from '@/infrastructure/api/anilist/anilist-errors';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';

describe('AniListRequestCoordinator', () => {
  it('coalesces identical keys and bounds concurrent work', async () => {
    const coordinator = new AniListRequestCoordinator({ maximumConcurrent: 1 });
    let releaseFirst: (() => void) | undefined;
    const firstOperation = jest.fn(
      () =>
        new Promise<number>((resolve) => {
          releaseFirst = () => resolve(1);
        }),
    );
    const secondOperation = jest.fn(async () => 2);

    const first = coordinator.schedule('same', firstOperation);
    const coalesced = coordinator.schedule('same', firstOperation);
    const second = coordinator.schedule('other', secondOperation);
    await Promise.resolve();

    expect(firstOperation).toHaveBeenCalledTimes(1);
    expect(secondOperation).not.toHaveBeenCalled();
    releaseFirst?.();
    await expect(Promise.all([first, coalesced, second])).resolves.toEqual([
      1, 1, 2,
    ]);
  });

  it('tracks dynamic headers and expires a blocked request window', async () => {
    let now = 1_000;
    const coordinator = new AniListRequestCoordinator({ now: () => now });
    coordinator.observeRateLimit({
      limit: 90,
      remaining: 0,
      retryAfterSeconds: 2,
      resetAt: null,
    });
    expect(coordinator.getSnapshot()).toMatchObject({
      limit: 90,
      remaining: 0,
      retryAfterSeconds: 2,
      blockedUntil: 3_000,
    });
    await expect(
      coordinator.schedule('blocked', async () => true),
    ).rejects.toBeInstanceOf(AniListRateLimitError);
    now = 3_001;
    await expect(
      coordinator.schedule('available', async () => true),
    ).resolves.toBe(true);
  });

  it('does not start queued work after another request activates a rate window', async () => {
    let releaseFirst: (() => void) | undefined;
    const coordinator = new AniListRequestCoordinator({
      maximumConcurrent: 1,
    });
    const first = coordinator.schedule(
      'first',
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const queuedOperation = jest.fn(async () => true);
    const queued = coordinator.schedule('queued', queuedOperation);
    await Promise.resolve();
    coordinator.block(1_000, null);
    releaseFirst?.();
    await first;

    await expect(queued).rejects.toBeInstanceOf(AniListRateLimitError);
    expect(queuedOperation).not.toHaveBeenCalled();
  });
});
