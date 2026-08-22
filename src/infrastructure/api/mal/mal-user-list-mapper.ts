import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import {
  isKnownMalStatus,
  type MalUserListStatusDto,
} from '@/infrastructure/api/mal/mal-user-list-dtos';

function mapScore(score: number): number | null {
  if (score === 0) return null;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error('MyAnimeList returned a score outside the 1-10 range.');
  }
  return score;
}

export function mapDomainScoreToRaw(score: number | null): number {
  return score === null ? 0 : score;
}

export function mapMalUserListEntry(
  animeId: number,
  status: MalUserListStatusDto,
): UserAnimeEntry {
  if (!isKnownMalStatus(status.status)) {
    throw new Error(
      `MyAnimeList returned an unknown list status: ${status.status}.`,
    );
  }
  return {
    animeId,
    status: status.status as AnimeListStatus,
    watchedEpisodes: Math.max(0, Math.trunc(status.numEpisodesWatched)),
    userScore: mapScore(status.score),
    updatedAt: status.updatedAt,
  };
}
