import type { SyncTarget } from '@/application/sync/user-anime-sync';
import type { PendingSyncOperation } from '@/domain/models/pending-sync-operation';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';

export class UserAnimeListSyncTarget implements SyncTarget {
  constructor(
    private readonly repository: UserAnimeListRepository,
    readonly id = 'guest-list',
  ) {}

  async apply(operation: PendingSyncOperation): Promise<void> {
    switch (operation.type) {
      case 'SET_PROGRESS':
        await this.repository.updateProgress(
          operation.animeId,
          operation.value,
        );
        break;
      case 'SET_STATUS':
        await this.repository.updateStatus(operation.animeId, operation.value);
        break;
      case 'SET_SCORE':
        await this.repository.updateScore(operation.animeId, operation.value);
        break;
    }
  }
}
