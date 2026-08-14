import type {
  SyncStatus,
  UserAnimeSync,
} from '@/application/sync/user-anime-sync';
import type { PendingSyncIntent } from '@/domain/models/pending-sync-operation';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';

const IDLE_STATUS: SyncStatus = {
  pendingCount: 0,
  syncing: false,
  failedCount: 0,
  storageError: false,
};

export class ImmediateUserAnimeSync implements UserAnimeSync {
  readonly enqueued: PendingSyncIntent[] = [];

  constructor(private readonly repository: UserAnimeListRepository) {}

  async enqueue(intent: PendingSyncIntent): Promise<void> {
    this.enqueued.push({ ...intent });
    switch (intent.type) {
      case 'SET_PROGRESS':
        await this.repository.updateProgress(intent.animeId, intent.value);
        break;
      case 'SET_STATUS':
        await this.repository.updateStatus(intent.animeId, intent.value);
        break;
      case 'SET_SCORE':
        await this.repository.updateScore(intent.animeId, intent.value);
        break;
    }
  }

  async processPending(): Promise<void> {}

  getStatus(): SyncStatus {
    return IDLE_STATUS;
  }

  subscribe(): () => void {
    return () => undefined;
  }
}
