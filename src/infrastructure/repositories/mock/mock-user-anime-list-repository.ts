import type { AnimeListStatus, UserAnimeEntry } from '@/domain/models/anime';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { applyProgress } from '@/domain/rules/anime-progress';
import { validateUserScore } from '@/domain/rules/anime-score';
import { transitionStatus } from '@/domain/rules/anime-status';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';

export class MockUserAnimeListRepository implements UserAnimeListRepository {
  constructor(private readonly runtime: MockRuntime) {}

  getAll(): Promise<UserAnimeEntry[]> {
    return this.runtime.run(() =>
      this.runtime.getDataset().userEntries.map((entry) => ({ ...entry })),
    );
  }

  getByStatus(status: AnimeListStatus): Promise<UserAnimeEntry[]> {
    return this.runtime.run(() =>
      this.runtime
        .getDataset()
        .userEntries.filter((entry) => entry.status === status)
        .map((entry) => ({ ...entry })),
    );
  }

  getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    return this.runtime.run(() => {
      const entry = this.findEntry(animeId);
      return entry ? { ...entry } : null;
    });
  }

  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry> {
    return this.runtime.run(() => {
      const entry = this.ensureEntry(animeId);
      const updated = applyProgress(
        entry,
        episodes,
        this.getTotalEpisodes(animeId),
      );
      return this.save({ ...updated, updatedAt: new Date().toISOString() });
    });
  }

  updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return this.runtime.run(() => {
      const entry = this.ensureEntry(animeId);
      const updated = transitionStatus(
        entry,
        status,
        this.getTotalEpisodes(animeId),
      );
      return this.save({ ...updated, updatedAt: new Date().toISOString() });
    });
  }

  updateScore(animeId: number, score: number | null): Promise<UserAnimeEntry> {
    return this.runtime.run(() => {
      const entry = this.ensureEntry(animeId);
      return this.save({
        ...entry,
        userScore: validateUserScore(score),
        updatedAt: new Date().toISOString(),
      });
    });
  }

  reset(): Promise<void> {
    return this.runtime.run(() => this.runtime.resetDataset());
  }

  private findEntry(animeId: number): UserAnimeEntry | undefined {
    return this.runtime
      .getDataset()
      .userEntries.find((entry) => entry.animeId === animeId);
  }

  private ensureEntry(animeId: number): UserAnimeEntry {
    const animeExists = this.runtime
      .getDataset()
      .catalog.some((anime) => anime.id === animeId);
    if (!animeExists) throw new Error(`Anime ${animeId} was not found.`);
    return (
      this.findEntry(animeId) ?? {
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: new Date().toISOString(),
      }
    );
  }

  private getTotalEpisodes(animeId: number): number | null {
    return (
      this.runtime.getDataset().catalog.find((anime) => anime.id === animeId)
        ?.totalEpisodes ?? null
    );
  }

  private save(entry: UserAnimeEntry): UserAnimeEntry {
    const entries = this.runtime.getDataset().userEntries;
    const index = entries.findIndex(
      (current) => current.animeId === entry.animeId,
    );
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
    return { ...entry };
  }
}
