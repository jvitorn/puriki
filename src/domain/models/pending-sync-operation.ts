import type { AnimeListStatus } from '@/domain/models/anime';

export type PendingSyncIntent =
  | {
      animeId: number;
      type: 'SET_PROGRESS';
      value: number;
    }
  | {
      animeId: number;
      type: 'SET_STATUS';
      value: AnimeListStatus;
    }
  | {
      animeId: number;
      type: 'SET_SCORE';
      value: number | null;
    };

export interface PendingSyncTargetState {
  status: 'pending' | 'success';
  attempts: number;
  lastAttemptAt: number | null;
}

export type PendingSyncOperation = PendingSyncIntent & {
  id: string;
  createdAt: number;
  updatedAt: number;
  targets: Record<string, PendingSyncTargetState>;
};
