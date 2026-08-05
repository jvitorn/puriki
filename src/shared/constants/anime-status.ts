import type { AnimeListStatus } from '@/domain/models/anime';

export const ANIME_STATUSES: AnimeListStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

export const STATUS_LABELS: Record<AnimeListStatus, string> = {
  watching: 'Watching',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
  plan_to_watch: 'Plan to Watch',
};
