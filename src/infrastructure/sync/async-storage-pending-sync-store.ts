import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AnimeListStatus } from '@/domain/models/anime';
import type {
  PendingSyncOperation,
  PendingSyncTargetState,
} from '@/domain/models/pending-sync-operation';
import type { PendingSyncStore } from '@/domain/repositories/pending-sync-store';

export const PENDING_SYNC_STORAGE_KEY = 'purikuki:pending-sync:v1';

const ANIME_LIST_STATUSES: readonly AnimeListStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTargetState(value: unknown): value is PendingSyncTargetState {
  if (!isRecord(value)) return false;
  return (
    (value.status === 'pending' || value.status === 'success') &&
    typeof value.attempts === 'number' &&
    Number.isInteger(value.attempts) &&
    value.attempts >= 0 &&
    (value.lastAttemptAt === null || typeof value.lastAttemptAt === 'number')
  );
}

function hasValidTargets(
  value: unknown,
): value is Record<string, PendingSyncTargetState> {
  return (
    isRecord(value) &&
    Object.values(value).every((state) => isTargetState(state))
  );
}

function isPendingSyncOperation(value: unknown): value is PendingSyncOperation {
  if (!isRecord(value)) return false;
  const validBase =
    typeof value.id === 'string' &&
    typeof value.animeId === 'number' &&
    Number.isInteger(value.animeId) &&
    value.animeId > 0 &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    hasValidTargets(value.targets);
  if (!validBase) return false;

  if (value.type === 'SET_PROGRESS') {
    return (
      typeof value.value === 'number' &&
      Number.isInteger(value.value) &&
      value.value >= 0
    );
  }
  if (value.type === 'SET_STATUS') {
    return ANIME_LIST_STATUSES.includes(value.value as AnimeListStatus);
  }
  if (value.type === 'SET_SCORE') {
    return (
      value.value === null ||
      (typeof value.value === 'number' &&
        Number.isInteger(value.value) &&
        value.value >= 1 &&
        value.value <= 10)
    );
  }
  return false;
}

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

export class AsyncStoragePendingSyncStore implements PendingSyncStore {
  constructor(private readonly storageKey = PENDING_SYNC_STORAGE_KEY) {}

  async getAll(): Promise<PendingSyncOperation[]> {
    const stored = await AsyncStorage.getItem(this.storageKey);
    if (stored === null) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isPendingSyncOperation)) {
      throw new Error('Pending sync storage contains invalid data.');
    }
    return parsed.map(cloneOperation);
  }

  async save(operation: PendingSyncOperation): Promise<void> {
    const operations = await this.getAll();
    if (operations.some((current) => current.id === operation.id)) {
      throw new Error(`Pending sync operation ${operation.id} already exists.`);
    }
    await this.write([...operations, operation]);
  }

  async replace(operation: PendingSyncOperation): Promise<void> {
    const operations = await this.getAll();
    const index = operations.findIndex(
      (current) => current.id === operation.id,
    );
    if (index < 0) {
      throw new Error(`Pending sync operation ${operation.id} was not found.`);
    }
    operations[index] = cloneOperation(operation);
    await this.write(operations);
  }

  async remove(id: string): Promise<void> {
    const operations = await this.getAll();
    await this.write(operations.filter((operation) => operation.id !== id));
  }

  private write(operations: readonly PendingSyncOperation[]): Promise<void> {
    return AsyncStorage.setItem(this.storageKey, JSON.stringify(operations));
  }
}
