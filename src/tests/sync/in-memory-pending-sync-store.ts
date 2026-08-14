import type { PendingSyncOperation } from '@/domain/models/pending-sync-operation';
import type { PendingSyncStore } from '@/domain/repositories/pending-sync-store';

function cloneOperation(operation: PendingSyncOperation): PendingSyncOperation {
  return {
    ...operation,
    targets: Object.fromEntries(
      Object.entries(operation.targets).map(([id, state]) => [
        id,
        { ...state },
      ]),
    ),
  };
}

export class InMemoryPendingSyncStore implements PendingSyncStore {
  private operations: PendingSyncOperation[];

  constructor(initial: readonly PendingSyncOperation[] = []) {
    this.operations = initial.map(cloneOperation);
  }

  async getAll(): Promise<PendingSyncOperation[]> {
    return this.operations.map(cloneOperation);
  }

  async save(operation: PendingSyncOperation): Promise<void> {
    this.operations.push(cloneOperation(operation));
  }

  async replace(operation: PendingSyncOperation): Promise<void> {
    const index = this.operations.findIndex(
      (current) => current.id === operation.id,
    );
    if (index < 0) throw new Error('Pending operation was not found.');
    this.operations[index] = cloneOperation(operation);
  }

  async remove(id: string): Promise<void> {
    this.operations = this.operations.filter(
      (operation) => operation.id !== id,
    );
  }
}
