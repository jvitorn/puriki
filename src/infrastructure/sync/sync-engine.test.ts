import type { SyncTarget } from '@/application/sync/user-anime-sync';
import type { PendingSyncOperation } from '@/domain/models/pending-sync-operation';
import { SyncEngine } from '@/infrastructure/sync/sync-engine';
import { InMemoryPendingSyncStore } from '@/tests/sync/in-memory-pending-sync-store';

class FakeSyncTarget implements SyncTarget {
  readonly apply = jest.fn<Promise<void>, [PendingSyncOperation]>();
  shouldFail = false;

  constructor(readonly id: string) {
    this.apply.mockImplementation(async () => {
      if (this.shouldFail) throw new Error(`${this.id} is unavailable.`);
    });
  }
}

function createEngine(
  store: InMemoryPendingSyncStore,
  targets: readonly SyncTarget[],
): SyncEngine {
  let timestamp = 1_000;
  let id = 0;
  return new SyncEngine(store, targets, {
    debounceMs: 400,
    retryDelayMs: 5_000,
    maximumAutomaticAttempts: 3,
    now: () => (timestamp += 1),
    createId: () => `operation-${(id += 1)}`,
  });
}

describe('SyncEngine', () => {
  beforeEach(() => jest.useFakeTimers());

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('persists, processes, and removes a successful operation', async () => {
    const store = new InMemoryPendingSyncStore();
    const target = new FakeSyncTarget('anilist');
    const engine = createEngine(store, [target]);

    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 8 });
    expect(engine.getStatus()).toMatchObject({
      pendingCount: 1,
      syncing: false,
      failedCount: 0,
    });

    await engine.processPending();

    expect(target.apply).toHaveBeenCalledTimes(1);
    expect(target.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        animeId: 123,
        type: 'SET_PROGRESS',
        value: 8,
      }),
    );
    await expect(store.getAll()).resolves.toEqual([]);
    expect(engine.getStatus().pendingCount).toBe(0);
    engine.dispose();
  });

  it('keeps per-target success when another provider fails', async () => {
    const store = new InMemoryPendingSyncStore();
    const anilist = new FakeSyncTarget('anilist');
    const mal = new FakeSyncTarget('mal');
    mal.shouldFail = true;
    const engine = createEngine(store, [anilist, mal]);

    await engine.enqueue({ animeId: 123, type: 'SET_SCORE', value: 9 });
    await engine.processPending();

    const [pending] = await store.getAll();
    expect(pending?.targets).toEqual({
      anilist: {
        status: 'success',
        attempts: 1,
        lastAttemptAt: expect.any(Number),
      },
      mal: {
        status: 'pending',
        attempts: 1,
        lastAttemptAt: expect.any(Number),
      },
    });
    expect(engine.getStatus()).toMatchObject({
      pendingCount: 1,
      failedCount: 1,
    });
    engine.dispose();
  });

  it('retries only the failed provider and removes after success', async () => {
    const store = new InMemoryPendingSyncStore();
    const anilist = new FakeSyncTarget('anilist');
    const mal = new FakeSyncTarget('mal');
    mal.shouldFail = true;
    const engine = createEngine(store, [anilist, mal]);

    await engine.enqueue({
      animeId: 123,
      type: 'SET_STATUS',
      value: 'watching',
    });
    await engine.processPending();
    mal.shouldFail = false;
    await engine.processPending();

    expect(anilist.apply).toHaveBeenCalledTimes(1);
    expect(mal.apply).toHaveBeenCalledTimes(2);
    await expect(store.getAll()).resolves.toEqual([]);
    engine.dispose();
  });

  it('coalesces rapid progress into the final value before delivery', async () => {
    const store = new InMemoryPendingSyncStore();
    const target = new FakeSyncTarget('anilist');
    const engine = createEngine(store, [target]);

    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 10 });
    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 11 });
    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 12 });

    await expect(store.getAll()).resolves.toEqual([
      expect.objectContaining({
        animeId: 123,
        type: 'SET_PROGRESS',
        value: 12,
      }),
    ]);
    await engine.processPending();
    expect(target.apply).toHaveBeenCalledTimes(1);
    expect(target.apply).toHaveBeenCalledWith(
      expect.objectContaining({ value: 12 }),
    );
    engine.dispose();
  });

  it('waits for inactivity before automatically delivering coalesced progress', async () => {
    const store = new InMemoryPendingSyncStore();
    const target = new FakeSyncTarget('anilist');
    const engine = createEngine(store, [target]);

    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 20 });
    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 21 });
    await engine.enqueue({ animeId: 123, type: 'SET_PROGRESS', value: 22 });

    jest.advanceTimersByTime(399);
    expect(target.apply).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await engine.processPending();

    expect(target.apply).toHaveBeenCalledTimes(1);
    expect(target.apply).toHaveBeenCalledWith(
      expect.objectContaining({ value: 22 }),
    );
    engine.dispose();
  });

  it('restores persisted operations in a reconstructed engine', async () => {
    const store = new InMemoryPendingSyncStore();
    const originalTarget = new FakeSyncTarget('anilist');
    const original = createEngine(store, [originalTarget]);
    await original.enqueue({ animeId: 123, type: 'SET_SCORE', value: 7 });
    original.dispose();

    const restoredTarget = new FakeSyncTarget('anilist');
    const restored = createEngine(store, [restoredTarget]);
    await restored.start();
    expect(restored.getStatus().pendingCount).toBe(1);
    await restored.processPending();

    expect(restoredTarget.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        animeId: 123,
        type: 'SET_SCORE',
        value: 7,
      }),
    );
    await expect(store.getAll()).resolves.toEqual([]);
    restored.dispose();
  });

  it('coalesces status changes to the final semantic state', async () => {
    const store = new InMemoryPendingSyncStore();
    const target = new FakeSyncTarget('anilist');
    const engine = createEngine(store, [target]);

    await engine.enqueue({
      animeId: 123,
      type: 'SET_STATUS',
      value: 'watching',
    });
    await engine.enqueue({
      animeId: 123,
      type: 'SET_STATUS',
      value: 'completed',
    });
    await engine.processPending();

    expect(target.apply).toHaveBeenCalledTimes(1);
    expect(target.apply).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SET_STATUS', value: 'completed' }),
    );
    engine.dispose();
  });
});
