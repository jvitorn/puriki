import { act, renderHook } from '@testing-library/react-native';

import { useEpisodeProgressIntent } from '@/presentation/hooks/use-episode-progress-intent';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useEpisodeProgressIntent', () => {
  afterEach(() => jest.useRealTimers());

  it('coalesces a synchronous burst of taps into a single debounced call', async () => {
    jest.useFakeTimers();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => {
      result.current.increase();
      result.current.increase();
      result.current.increase();
    });
    expect(result.current.displayedProgress).toBe(7);
    expect(mutateAsync).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ animeId: 1, episodes: 7 });
  });

  it('keeps the UI advancing while a request is in flight and sends exactly one follow-up with the latest value', async () => {
    jest.useFakeTimers();
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    const mutateAsync = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => result.current.increase());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(mutateAsync).toHaveBeenNthCalledWith(1, { animeId: 1, episodes: 5 });

    await act(() => {
      result.current.increase();
      result.current.increase();
      result.current.increase();
    });
    expect(result.current.displayedProgress).toBe(8);
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve();
      await first.promise;
    });

    // The follow-up for 8 is now in flight but not yet resolved — the UI
    // must keep showing 8, not fall back to the stale confirmed value.
    expect(mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutateAsync).toHaveBeenNthCalledWith(2, { animeId: 1, episodes: 8 });
    expect(result.current.displayedProgress).toBe(8);

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(mutateAsync).toHaveBeenCalledTimes(2);
  });

  it('never lets a settling request override a newer local intent, even across chained follow-ups', async () => {
    jest.useFakeTimers();
    const first = createDeferred<void>();
    const second = createDeferred<void>();
    const third = createDeferred<void>();
    const mutateAsync = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => result.current.increase());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(mutateAsync).toHaveBeenNthCalledWith(1, { animeId: 1, episodes: 5 });

    await act(() => {
      result.current.increase();
      result.current.increase();
      result.current.increase();
    });
    expect(result.current.displayedProgress).toBe(8);

    await act(async () => {
      first.resolve();
      await first.promise;
    });
    expect(mutateAsync).toHaveBeenNthCalledWith(2, { animeId: 1, episodes: 8 });
    expect(result.current.displayedProgress).toBe(8);

    await act(() => result.current.increase());
    expect(result.current.displayedProgress).toBe(9);
    expect(mutateAsync).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve();
      await second.promise;
    });
    expect(mutateAsync).toHaveBeenCalledTimes(3);
    expect(mutateAsync).toHaveBeenNthCalledWith(3, { animeId: 1, episodes: 9 });
    expect(result.current.displayedProgress).toBe(9);
  });

  it('resolves a mixed increase/decrease burst to the correct net value', async () => {
    jest.useFakeTimers();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => {
      result.current.increase(); // 5
      result.current.increase(); // 6
      result.current.decrease(); // 5
      result.current.increase(); // 6
    });
    expect(result.current.displayedProgress).toBe(6);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ animeId: 1, episodes: 6 });
  });

  it('skips the network call entirely when a burst cancels back to the confirmed value', async () => {
    jest.useFakeTimers();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => {
      result.current.increase();
      result.current.decrease();
    });
    expect(result.current.displayedProgress).toBe(4);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('reverts to the confirmed value without a phantom number when the final attempt fails, and does not auto-retry', async () => {
    jest.useFakeTimers();
    const deferred = createDeferred<void>();
    const mutateAsync = jest.fn().mockReturnValueOnce(deferred.promise);
    const { result, rerender } = await renderHook(
      ({ confirmedProgress }: { confirmedProgress: number }) =>
        useEpisodeProgressIntent({
          animeId: 1,
          confirmedProgress,
          episodeLimit: 12,
          mutateAsync,
        }),
      { initialProps: { confirmedProgress: 4 } },
    );

    await act(() => result.current.increase());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(result.current.displayedProgress).toBe(5);

    await act(async () => {
      deferred.reject(new Error('network down'));
      await deferred.promise.catch(() => {});
    });

    // The hook immediately defers back to confirmedProgress on failure; no
    // separate prop change is required to clear the local override.
    expect(result.current.displayedProgress).toBe(4);
    expect(mutateAsync).toHaveBeenCalledTimes(1);

    // A rerender with the same (real onError-reconciled) confirmedProgress
    // stays consistent and does not trigger an automatic retry.
    await rerender({ confirmedProgress: 4 });
    expect(result.current.displayedProgress).toBe(4);
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it('flushes a pending debounced intent immediately on unmount instead of dropping it', async () => {
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    const { result, unmount } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 4,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => result.current.increase());
    expect(mutateAsync).not.toHaveBeenCalled();

    await act(() => unmount());

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ animeId: 1, episodes: 5 });
  });

  it('clamps at the episode bounds and does not schedule a call beyond them', async () => {
    jest.useFakeTimers();
    const mutateAsync = jest.fn().mockResolvedValue(undefined);
    const { result } = await renderHook(() =>
      useEpisodeProgressIntent({
        animeId: 1,
        confirmedProgress: 12,
        episodeLimit: 12,
        mutateAsync,
      }),
    );

    await act(() => result.current.increase());
    expect(result.current.displayedProgress).toBe(12);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(400);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});
