import type {
  PendingSyncIntent,
  PendingSyncOperation,
} from '@/domain/models/pending-sync-operation';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { UserAnimeListSyncTarget } from '@/infrastructure/sync/user-anime-list-sync-target';

function repository(): jest.Mocked<UserAnimeListRepository> {
  return {
    getPage: jest.fn(),
    getByAnimeId: jest.fn(),
    addToList: jest.fn(),
    removeFromList: jest.fn(),
    updateProgress: jest.fn(),
    updateStatus: jest.fn(),
    updateScore: jest.fn(),
  };
}

function operation(intent: PendingSyncIntent): PendingSyncOperation {
  return {
    ...intent,
    id: 'operation-1',
    createdAt: 1_000,
    updatedAt: 1_000,
    targets: {},
  };
}

describe('UserAnimeListSyncTarget', () => {
  it('maps provider-neutral operations to the current repository', async () => {
    const userListRepository = repository();
    const target = new UserAnimeListSyncTarget(userListRepository);

    await target.apply(
      operation({ animeId: 123, type: 'SET_PROGRESS', value: 12 }),
    );
    await target.apply(
      operation({ animeId: 123, type: 'SET_STATUS', value: 'completed' }),
    );
    await target.apply(
      operation({ animeId: 123, type: 'SET_SCORE', value: 9 }),
    );

    expect(userListRepository.updateProgress).toHaveBeenCalledWith(123, 12);
    expect(userListRepository.updateStatus).toHaveBeenCalledWith(
      123,
      'completed',
    );
    expect(userListRepository.updateScore).toHaveBeenCalledWith(123, 9);
  });
});
