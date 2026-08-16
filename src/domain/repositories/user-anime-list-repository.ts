import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import type { PageRequest, PageResult } from '@/domain/models/pagination';

export interface UserAnimeListPageRequest extends PageRequest {
  status?: AnimeListStatus;
}

export interface UserAnimeListRepository {
  invalidateCache(): void;
  getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>>;
  getByAnimeId(animeId: number): Promise<UserAnimeEntry | null>;
  addToList(animeId: number, status?: AnimeListStatus): Promise<UserAnimeEntry>;
  removeFromList(animeId: number): Promise<void>;
  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry>;
  updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry>;
  updateScore(animeId: number, score: number | null): Promise<UserAnimeEntry>;
}
