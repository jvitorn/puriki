import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';

describe('JikanRequestScheduler', () => {
  it('spaces jikan-ts request starts by one second', async () => {
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
    expect(starts).toEqual([100, 1_100, 2_100]);
  });

  it('coalesces identical operations without replacing jikan-ts', async () => {
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
});
