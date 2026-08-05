import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';

export interface UserAnimeListRepository {
  getAll(): Promise<UserAnimeEntry[]>;
  getByStatus(status: AnimeListStatus): Promise<UserAnimeEntry[]>;
  getByAnimeId(animeId: number): Promise<UserAnimeEntry | null>;
  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry>;
  updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry>;
  updateScore(animeId: number, score: number | null): Promise<UserAnimeEntry>;
  reset(): Promise<void>;
}
