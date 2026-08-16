import { LatestProgressIntentCoordinator } from '@/application/mutations/latest-progress-intent';
import type { UserAnimeEntry } from '@/domain/models/anime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function entry(animeId: number, watchedEpisodes: number): UserAnimeEntry {
  return {
    animeId,
    status: 'watching',
    watchedEpisodes,
    userScore: null,
    updatedAt: `episode-${watchedEpisodes}`,
  };
}

describe('LatestProgressIntentCoordinator', () => {
  it('coalesces a single pending replacement', async () => {
    const first = deferred<UserAnimeEntry>();
    const last = deferred<UserAnimeEntry>();
    const updateProgress = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise);
    const coordinator = new LatestProgressIntentCoordinator({
      updateProgress,
    });

    const four = coordinator.submit(10, 4);
    const five = coordinator.submit(10, 5);
    first.resolve(entry(10, 4));
    await Promise.resolve();
    expect(updateProgress.mock.calls).toEqual([
      [10, 4],
      [10, 5],
    ]);
    last.resolve(entry(10, 5));
    await expect(Promise.all([four, five])).resolves.toEqual([
      entry(10, 5),
      entry(10, 5),
    ]);
  });

  it('sends the in-flight value and then the latest pending value', async () => {
    const first = deferred<UserAnimeEntry>();
    const last = deferred<UserAnimeEntry>();
    const updateProgress = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(last.promise);
    const coordinator = new LatestProgressIntentCoordinator({
      updateProgress,
    });

    const four = coordinator.submit(10, 4);
    const five = coordinator.submit(10, 5);
    const six = coordinator.submit(10, 6);
    expect(updateProgress).toHaveBeenCalledTimes(1);
    expect(updateProgress).toHaveBeenNthCalledWith(1, 10, 4);

    first.resolve(entry(10, 4));
    await Promise.resolve();
    expect(updateProgress).toHaveBeenCalledTimes(2);
    expect(updateProgress).toHaveBeenNthCalledWith(2, 10, 6);
    last.resolve(entry(10, 6));

    await expect(Promise.all([four, five, six])).resolves.toEqual([
      entry(10, 6),
      entry(10, 6),
      entry(10, 6),
    ]);
  });

  it('keeps different anime in parallel', async () => {
    const first = deferred<UserAnimeEntry>();
    const second = deferred<UserAnimeEntry>();
    const updateProgress = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const coordinator = new LatestProgressIntentCoordinator({
      updateProgress,
    });

    const animeOne = coordinator.submit(1, 4);
    const animeTwo = coordinator.submit(2, 8);
    expect(updateProgress).toHaveBeenNthCalledWith(1, 1, 4);
    expect(updateProgress).toHaveBeenNthCalledWith(2, 2, 8);
    first.resolve(entry(1, 4));
    second.resolve(entry(2, 8));
    await expect(Promise.all([animeOne, animeTwo])).resolves.toEqual([
      entry(1, 4),
      entry(2, 8),
    ]);
  });

  it('drops the failed flight so a manual retry starts with the final intent', async () => {
    const failed = deferred<UserAnimeEntry>();
    const updateProgress = jest
      .fn()
      .mockReturnValueOnce(failed.promise)
      .mockResolvedValueOnce(entry(10, 6));
    const coordinator = new LatestProgressIntentCoordinator({
      updateProgress,
    });

    const initial = coordinator.submit(10, 4);
    const final = coordinator.submit(10, 6);
    failed.reject(new Error('ambiguous failure'));
    await expect(initial).rejects.toThrow('ambiguous failure');
    await expect(final).rejects.toThrow('ambiguous failure');

    await expect(coordinator.submit(10, 6)).resolves.toEqual(entry(10, 6));
    expect(updateProgress).toHaveBeenNthCalledWith(2, 10, 6);
  });
});
