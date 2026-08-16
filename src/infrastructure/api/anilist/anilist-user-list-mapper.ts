import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import type { AniListUserListEntryDto } from '@/infrastructure/api/anilist/anilist-user-list-dtos';

export interface MappedAniListUserEntry {
  listEntryId: number;
  mediaId: number;
  totalEpisodes: number | null;
  entry: UserAnimeEntry;
}

export function mapAniListStatus(status: string): AnimeListStatus {
  const statuses: Record<string, AnimeListStatus> = {
    CURRENT: 'watching',
    REPEATING: 'watching',
    COMPLETED: 'completed',
    PAUSED: 'on_hold',
    DROPPED: 'dropped',
    PLANNING: 'plan_to_watch',
  };
  const mapped = statuses[status];
  if (!mapped)
    throw new Error(`AniList returned an unknown list status: ${status}.`);
  return mapped;
}

export function mapDomainStatus(status: AnimeListStatus): string {
  const statuses: Record<AnimeListStatus, string> = {
    watching: 'CURRENT',
    completed: 'COMPLETED',
    on_hold: 'PAUSED',
    dropped: 'DROPPED',
    plan_to_watch: 'PLANNING',
  };
  return statuses[status];
}

export function mapDomainScoreToRaw(score: number | null): number {
  return score === null ? 0 : score * 10;
}

function mapScore(score: number | null): number | null {
  if (score === null || score === 0) return null;
  if (!Number.isInteger(score) || score < 1 || score > 10) {
    throw new Error('AniList returned a score outside the POINT_10 range.');
  }
  return score;
}

function mapProgress(progress: number | null): number {
  if (progress === null) return 0;
  if (!Number.isInteger(progress) || progress < 0) {
    throw new Error('AniList returned an invalid episode progress.');
  }
  return progress;
}

function mapUpdatedAt(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds < 0) {
    throw new Error('AniList returned an invalid media list timestamp.');
  }
  const timestamp = new Date(seconds * 1_000);
  if (Number.isNaN(timestamp.getTime())) {
    throw new Error('AniList returned an invalid media list timestamp.');
  }
  return timestamp.toISOString();
}

export function mapAniListUserListEntry(
  dto: AniListUserListEntryDto,
): MappedAniListUserEntry | null {
  if (dto.idMal === null) return null;
  return {
    listEntryId: dto.listEntryId,
    mediaId: dto.mediaId,
    totalEpisodes:
      dto.totalEpisodes !== null && dto.totalEpisodes > 0
        ? dto.totalEpisodes
        : null,
    entry: {
      animeId: dto.idMal,
      status: mapAniListStatus(dto.status),
      watchedEpisodes: mapProgress(dto.progress),
      userScore: mapScore(dto.score),
      updatedAt: mapUpdatedAt(dto.updatedAt),
    },
  };
}
