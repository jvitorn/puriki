import type {
  PendingSyncIntent,
  PendingSyncOperation,
} from '@/domain/models/pending-sync-operation';

export interface SyncStatus {
  pendingCount: number;
  syncing: boolean;
  failedCount: number;
  storageError: boolean;
}

export interface SyncTarget {
  readonly id: string;
  apply(operation: PendingSyncOperation): Promise<void>;
}

export interface UserAnimeSync {
  enqueue(intent: PendingSyncIntent): Promise<void>;
  processPending(): Promise<void>;
  getStatus(): SyncStatus;
  subscribe(listener: () => void): () => void;
}
