import type { PendingSyncOperation } from '@/domain/models/pending-sync-operation';

export interface PendingSyncStore {
  getAll(): Promise<PendingSyncOperation[]>;
  save(operation: PendingSyncOperation): Promise<void>;
  replace(operation: PendingSyncOperation): Promise<void>;
  remove(id: string): Promise<void>;
}
