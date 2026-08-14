import type {
  SyncStatus,
  SyncTarget,
  UserAnimeSync,
} from '@/application/sync/user-anime-sync';
import type {
  PendingSyncIntent,
  PendingSyncOperation,
  PendingSyncTargetState,
} from '@/domain/models/pending-sync-operation';
import type { PendingSyncStore } from '@/domain/repositories/pending-sync-store';

export interface SyncEngineOptions {
  debounceMs?: number;
  retryDelayMs?: number;
  maximumAutomaticAttempts?: number;
  now?: () => number;
  createId?: () => string;
}

const DEFAULT_DEBOUNCE_MS = 400;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const DEFAULT_MAXIMUM_AUTOMATIC_ATTEMPTS = 3;

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

function pendingTargetState(): PendingSyncTargetState {
  return { status: 'pending', attempts: 0, lastAttemptAt: null };
}

function sameIntent(
  operation: PendingSyncOperation,
  intent: PendingSyncIntent,
): boolean {
  return (
    operation.animeId === intent.animeId &&
    operation.type === intent.type &&
    operation.value === intent.value
  );
}

function validateIntent(intent: PendingSyncIntent): void {
  if (!Number.isInteger(intent.animeId) || intent.animeId <= 0) {
    throw new Error('A sync operation requires a positive anime ID.');
  }
  if (
    intent.type === 'SET_PROGRESS' &&
    (!Number.isInteger(intent.value) || intent.value < 0)
  ) {
    throw new Error('Progress must be a non-negative whole number.');
  }
  if (
    intent.type === 'SET_SCORE' &&
    intent.value !== null &&
    (!Number.isInteger(intent.value) || intent.value < 1 || intent.value > 10)
  ) {
    throw new Error('A score must be a whole number between 1 and 10.');
  }
}

export class SyncEngine implements UserAnimeSync {
  private readonly targets: Map<string, SyncTarget>;
  private readonly debounceMs: number;
  private readonly retryDelayMs: number;
  private readonly maximumAutomaticAttempts: number;
  private readonly now: () => number;
  private readonly createId: () => string;
  private operations: PendingSyncOperation[] | null = null;
  private listeners = new Set<() => void>();
  private status: SyncStatus = {
    pendingCount: 0,
    syncing: false,
    failedCount: 0,
    storageError: false,
  };
  private lock: Promise<void> = Promise.resolve();
  private processing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idSequence = 0;

  constructor(
    private readonly store: PendingSyncStore,
    targets: readonly SyncTarget[],
    options: SyncEngineOptions = {},
  ) {
    this.targets = new Map(targets.map((target) => [target.id, target]));
    if (this.targets.size !== targets.length) {
      throw new Error('Sync target IDs must be unique.');
    }
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.maximumAutomaticAttempts =
      options.maximumAutomaticAttempts ?? DEFAULT_MAXIMUM_AUTOMATIC_ATTEMPTS;
    this.now = options.now ?? Date.now;
    this.createId =
      options.createId ??
      (() => `${this.now()}-${(this.idSequence += 1).toString(36)}`);
  }

  async start(): Promise<void> {
    try {
      const hasPending = await this.runLocked(async () => {
        await this.loadLocked();
        this.setStorageError(false);
        return (this.operations?.length ?? 0) > 0;
      });
      if (hasPending) this.schedule(this.debounceMs);
    } catch {
      this.setStorageError(true);
    }
  }

  async enqueue(intent: PendingSyncIntent): Promise<void> {
    validateIntent(intent);
    try {
      await this.runLocked(async () => {
        await this.loadLocked();
        const operations = this.operations ?? [];
        const existingIndex = operations.findIndex(
          (operation) =>
            operation.animeId === intent.animeId &&
            operation.type === intent.type,
        );
        const timestamp = this.now();

        if (existingIndex >= 0) {
          const existing = operations[existingIndex];
          if (!existing) return;
          if (sameIntent(existing, intent)) return;
          const targetIds = new Set([
            ...Object.keys(existing.targets),
            ...this.targets.keys(),
          ]);
          const replacement: PendingSyncOperation = {
            ...intent,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: timestamp,
            targets: Object.fromEntries(
              [...targetIds].map((targetId) => [
                targetId,
                pendingTargetState(),
              ]),
            ),
          };
          await this.store.replace(replacement);
          operations[existingIndex] = replacement;
        } else {
          const operation: PendingSyncOperation = {
            ...intent,
            id: this.createId(),
            createdAt: timestamp,
            updatedAt: timestamp,
            targets: Object.fromEntries(
              [...this.targets.keys()].map((targetId) => [
                targetId,
                pendingTargetState(),
              ]),
            ),
          };
          await this.store.save(operation);
          operations.push(operation);
        }

        this.operations = operations;
        this.setStorageError(false);
        this.publishStatus();
      });
    } catch (error) {
      this.setStorageError(true);
      throw error;
    }
    this.schedule(this.debounceMs);
  }

  processPending(): Promise<void> {
    if (this.processing) return this.processing;
    const processing = this.runProcessing();
    this.processing = processing;
    void processing.finally(() => {
      if (this.processing === processing) this.processing = null;
    });
    return processing;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private async runProcessing(): Promise<void> {
    try {
      const operationIds = await this.runLocked(async () => {
        await this.loadLocked();
        this.status = { ...this.status, syncing: true, storageError: false };
        this.publishStatus();
        return [...(this.operations ?? [])]
          .sort(
            (left, right) =>
              left.updatedAt - right.updatedAt ||
              left.createdAt - right.createdAt,
          )
          .map((operation) => operation.id);
      });

      for (const operationId of operationIds) {
        const targetIds = await this.runLocked(() => {
          const operation = this.findOperation(operationId);
          return operation ? Object.keys(operation.targets) : [];
        });

        if (targetIds.length === 0) {
          await this.removeOperation(operationId);
          continue;
        }

        for (const targetId of targetIds) {
          const target = this.targets.get(targetId);
          if (!target) continue;
          const attempted = await this.runLocked(() => {
            const operation = this.findOperation(operationId);
            const targetState = operation?.targets[targetId];
            return operation && targetState?.status === 'pending'
              ? cloneOperation(operation)
              : null;
          });
          if (!attempted) continue;

          try {
            await target.apply(attempted);
            await this.recordAttempt(attempted, targetId, true);
          } catch {
            await this.recordAttempt(attempted, targetId, false);
          }
        }
      }
    } catch {
      this.setStorageError(true);
    } finally {
      const shouldRetry = await this.runLocked(() => {
        this.status = { ...this.status, syncing: false };
        this.publishStatus();
        return this.hasAutomaticallyRetryableWork();
      });
      if (shouldRetry) this.schedule(this.retryDelayMs);
    }
  }

  private async recordAttempt(
    attempted: PendingSyncOperation,
    targetId: string,
    succeeded: boolean,
  ): Promise<void> {
    await this.runLocked(async () => {
      const current = this.findOperation(attempted.id);
      if (!current || !sameIntent(current, attempted)) return;
      const currentTarget = current.targets[targetId];
      if (!currentTarget || currentTarget.status === 'success') return;

      const next: PendingSyncOperation = {
        ...current,
        targets: {
          ...current.targets,
          [targetId]: {
            status: succeeded ? 'success' : 'pending',
            attempts: currentTarget.attempts + 1,
            lastAttemptAt: this.now(),
          },
        },
      };
      if (
        Object.values(next.targets).every(({ status }) => status === 'success')
      ) {
        await this.store.remove(next.id);
        this.operations = (this.operations ?? []).filter(
          (operation) => operation.id !== next.id,
        );
      } else {
        await this.store.replace(next);
        const index = (this.operations ?? []).findIndex(
          (operation) => operation.id === next.id,
        );
        if (index >= 0 && this.operations) this.operations[index] = next;
      }
      this.setStorageError(false);
      this.publishStatus();
    });
  }

  private async removeOperation(id: string): Promise<void> {
    await this.runLocked(async () => {
      if (!this.findOperation(id)) return;
      await this.store.remove(id);
      this.operations = (this.operations ?? []).filter(
        (operation) => operation.id !== id,
      );
      this.publishStatus();
    });
  }

  private findOperation(id: string): PendingSyncOperation | undefined {
    return this.operations?.find((operation) => operation.id === id);
  }

  private async loadLocked(): Promise<void> {
    if (this.operations !== null) return;
    this.operations = await this.store.getAll();
    this.publishStatus();
  }

  private hasAutomaticallyRetryableWork(): boolean {
    return (this.operations ?? []).some((operation) =>
      Object.entries(operation.targets).some(
        ([targetId, target]) =>
          target.status === 'pending' &&
          target.attempts < this.maximumAutomaticAttempts &&
          this.targets.has(targetId),
      ),
    );
  }

  private schedule(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.processPending();
    }, delayMs);
  }

  private publishStatus(): void {
    const operations = this.operations ?? [];
    const next: SyncStatus = {
      ...this.status,
      pendingCount: operations.length,
      failedCount: operations.filter((operation) =>
        Object.values(operation.targets).some(
          (target) => target.status === 'pending' && target.attempts > 0,
        ),
      ).length,
    };
    if (
      next.pendingCount === this.status.pendingCount &&
      next.failedCount === this.status.failedCount &&
      next.syncing === this.status.syncing &&
      next.storageError === this.status.storageError
    ) {
      return;
    }
    this.status = next;
    this.listeners.forEach((listener) => listener());
  }

  private setStorageError(storageError: boolean): void {
    if (this.status.storageError === storageError) return;
    this.status = { ...this.status, storageError };
    this.listeners.forEach((listener) => listener());
  }

  private runLocked<T>(work: () => Promise<T> | T): Promise<T> {
    const result = this.lock.then(work, work);
    this.lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
