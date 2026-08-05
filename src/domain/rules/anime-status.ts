import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import { normalizeProgress } from '@/domain/rules/anime-progress';

export function transitionStatus(
  entry: UserAnimeEntry,
  status: AnimeListStatus,
  totalEpisodes: number | null,
): UserAnimeEntry {
  if (status === 'plan_to_watch') {
    return { ...entry, status, watchedEpisodes: 0 };
  }

  const watchedEpisodes = normalizeProgress(
    entry.watchedEpisodes,
    totalEpisodes,
  );
  if (status === 'completed' && totalEpisodes !== null) {
    return { ...entry, status, watchedEpisodes: totalEpisodes };
  }

  return { ...entry, status, watchedEpisodes };
}
