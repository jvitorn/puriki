import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';

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
  totalEpisodes: number | null,
): AnimeListStatus {
  if (
    totalEpisodes !== null &&
    totalEpisodes > 0 &&
    watchedEpisodes === totalEpisodes
  ) {
    return 'completed';
  }
  if (
    watchedEpisodes > 0 &&
    (currentStatus === 'plan_to_watch' || currentStatus === 'completed')
  ) {
    return 'watching';
  }
  return currentStatus;
}

export function applyProgress(
  entry: UserAnimeEntry,
  episodes: number,
  totalEpisodes: number | null,
): UserAnimeEntry {
  const watchedEpisodes = normalizeProgress(episodes, totalEpisodes);
  return {
    ...entry,
    watchedEpisodes,
    status: statusAfterProgress(entry.status, watchedEpisodes, totalEpisodes),
  };
}
