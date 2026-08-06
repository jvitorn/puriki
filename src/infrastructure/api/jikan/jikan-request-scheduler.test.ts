import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';

describe('JikanRequestScheduler', () => {
  it('spaces request starts by 500 milliseconds by default', async () => {
    let currentTime = 100;
    const starts: number[] = [];
    const scheduler = new JikanRequestScheduler({
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    });
    await Promise.all(
      ['popular', 'seasonal', 'upcoming'].map((key) =>
        scheduler.schedule(key, async () => {
          starts.push(currentTime);
          return key;
        }),
      ),
    );
    expect(starts).toEqual([100, 600, 1_100]);
  });

  it('coalesces concurrent identical operations', async () => {
    const scheduler = new JikanRequestScheduler({ requestIntervalMs: 0 });
    const operation = jest.fn(async () => 'done');
    const [first, second] = await Promise.all([
      scheduler.schedule('popular', operation),
      scheduler.schedule('popular', operation),
    ]);
    expect(first).toBe('done');
    expect(second).toBe('done');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('waits for the active request to finish before starting the next one', async () => {
    const scheduler = new JikanRequestScheduler({ requestIntervalMs: 0 });
    const starts: string[] = [];
    let releaseFirst = (): void => undefined;
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = scheduler.schedule('first', async () => {
      starts.push('first');
      await firstFinished;
    });
    const second = scheduler.schedule('second', async () => {
      starts.push('second');
    });

    await Promise.resolve();
    expect(starts).toEqual(['first']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(starts).toEqual(['first', 'second']);
  });

  it('allows a sequential retry with the same logical key', async () => {
    const scheduler = new JikanRequestScheduler({ requestIntervalMs: 0 });
    const firstOperation = jest.fn(async () =>
      Promise.reject(new Error('504')),
    );
    await expect(scheduler.schedule('popular', firstOperation)).rejects.toThrow(
      '504',
    );
    const retryOperation = jest.fn(async () => 'recovered');
    await expect(scheduler.schedule('popular', retryOperation)).resolves.toBe(
      'recovered',
    );
    expect(firstOperation).toHaveBeenCalledTimes(1);
    expect(retryOperation).toHaveBeenCalledTimes(1);
  });

  it('starts a new scheduler generation after clear while old work finishes', async () => {
    const scheduler = new JikanRequestScheduler({ requestIntervalMs: 0 });
    const starts: string[] = [];
    let releaseOld = (): void => undefined;
    const oldFinished = new Promise<void>((resolve) => {
      releaseOld = resolve;
    });
    const old = scheduler.schedule('popular', async () => {
      starts.push('old');
      await oldFinished;
    });
    await Promise.resolve();
    scheduler.clear();
    const fresh = scheduler.schedule('popular', async () => {
      starts.push('fresh');
    });
    await fresh;
    expect(starts).toEqual(['old', 'fresh']);
    releaseOld();
    await old;
  });

  it('continues the queue after a request fails', async () => {
    const scheduler = new JikanRequestScheduler({ requestIntervalMs: 0 });
    const failed = scheduler.schedule('failed', async () => {
      throw new Error('temporary failure');
    });
    const next = scheduler.schedule('next', async () => 'done');
    await expect(failed).rejects.toThrow('temporary failure');
    await expect(next).resolves.toBe('done');
  });
});
