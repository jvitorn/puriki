import type {
  AnimeListStatus,
  AnimeTrackingContext,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { canMarkAnimeCompleted } from '@/domain/rules/anime-airing-status';

export function normalizeProgress(
  episodes: number,
  totalEpisodes: number | null,
): number {
  const wholeEpisodes = Math.max(0, Math.trunc(episodes));
  return totalEpisodes === null
    ? wholeEpisodes
    : Math.min(wholeEpisodes, totalEpisodes);
}

export function canIncrementProgress(
  current: number,
  totalEpisodes: number | null,
): boolean {
  return totalEpisodes === null || current < totalEpisodes;
}

export function canDecrementProgress(current: number): boolean {
  return current > 0;
}

export function incrementProgress(
  current: number,
  totalEpisodes: number | null,
): number {
  return canIncrementProgress(current, totalEpisodes)
    ? normalizeProgress(current + 1, totalEpisodes)
    : normalizeProgress(current, totalEpisodes);
}

export function decrementProgress(current: number): number {
  return canDecrementProgress(current) ? current - 1 : 0;
}

export function statusAfterProgress(
  currentStatus: AnimeListStatus,
  watchedEpisodes: number,
  context: AnimeTrackingContext,
): AnimeListStatus {
  if (
    context.totalEpisodes !== null &&
    context.totalEpisodes > 0 &&
    watchedEpisodes === context.totalEpisodes &&
    canMarkAnimeCompleted(context.airingStatus)
  ) {
    return 'completed';
  }
  if (
    watchedEpisodes > 0 &&
    (currentStatus === 'plan_to_watch' || currentStatus === 'completed')
  ) {
    if (context.airingStatus === 'not_yet_released') return currentStatus;
    return 'watching';
  }
  return currentStatus;
}

export function applyProgress(
  entry: UserAnimeEntry,
  episodes: number,
  context: AnimeTrackingContext,
): UserAnimeEntry {
  if (
    context.airingStatus === 'not_yet_released' &&
    entry.status === 'plan_to_watch' &&
    episodes > entry.watchedEpisodes
  ) {
    return { ...entry };
  }
  const watchedEpisodes = normalizeProgress(episodes, context.totalEpisodes);
  return {
    ...entry,
    watchedEpisodes,
    status: statusAfterProgress(entry.status, watchedEpisodes, context),
  };
}
