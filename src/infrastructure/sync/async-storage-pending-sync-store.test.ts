import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PendingSyncOperation } from '@/domain/models/pending-sync-operation';
import {
  AsyncStoragePendingSyncStore,
  PENDING_SYNC_STORAGE_KEY,
} from '@/infrastructure/sync/async-storage-pending-sync-store';

function operation(value = 4): PendingSyncOperation {
  return {
    id: 'operation-1',
    animeId: 123,
    type: 'SET_PROGRESS',
    value,
    createdAt: 1_000,
    updatedAt: 1_000 + value,
    targets: {
      anilist: {
        status: 'pending',
        attempts: 0,
        lastAttemptAt: null,
      },
    },
  };
}

describe('AsyncStoragePendingSyncStore', () => {
  beforeEach(() => AsyncStorage.clear());

  it('saves isolated copies and supports replace and remove', async () => {
    const store = new AsyncStoragePendingSyncStore();
    await store.save(operation());

    const firstRead = await store.getAll();
    expect(firstRead).toEqual([operation()]);
    if (!firstRead[0]) throw new Error('Expected a stored operation.');
    firstRead[0].targets.anilist = {
      status: 'success',
      attempts: 10,
      lastAttemptAt: 2_000,
    };
    await expect(store.getAll()).resolves.toEqual([operation()]);

    await store.replace(operation(9));
    await expect(store.getAll()).resolves.toEqual([operation(9)]);
    await store.remove('operation-1');
    await expect(store.getAll()).resolves.toEqual([]);
  });

  it('rejects invalid persisted data instead of silently discarding intent', async () => {
    const store = new AsyncStoragePendingSyncStore();
    await AsyncStorage.setItem(
      PENDING_SYNC_STORAGE_KEY,
      JSON.stringify([{ id: 'incomplete-operation' }]),
    );

    await expect(store.getAll()).rejects.toThrow(
      'Pending sync storage contains invalid data.',
    );
  });
});
