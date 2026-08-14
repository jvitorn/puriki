import { DomainError } from '@/domain/errors/domain-error';
import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { validatePageRequest } from '@/domain/models/pagination';
import type { PageResult } from '@/domain/models/pagination';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type {
  UserAnimeListPageRequest,
  UserAnimeListRepository,
} from '@/domain/repositories/user-anime-list-repository';
import { applyProgress } from '@/domain/rules/anime-progress';
import { validateUserScore } from '@/domain/rules/anime-score';
import { transitionStatus } from '@/domain/rules/anime-status';
import type { TestAnimeDataset } from '@/tests/fixtures/anime-dataset';

function cloneAnime(anime: AnimeCatalogItem): AnimeCatalogItem {
  return {
    ...anime,
    alternativeTitles: [...anime.alternativeTitles],
    genres: [...anime.genres],
    studios: [...anime.studios],
    continuity: anime.continuity.map((relation) => ({ ...relation })),
    streamingServices: anime.streamingServices.map((service) => ({
      ...service,
    })),
  };
}

export class InMemoryAnimeCatalogRepository implements AnimeCatalogRepository {
  constructor(private readonly dataset: TestAnimeDataset) {}

  async getFeatured(): Promise<AnimeCatalogItem> {
    const featured = this.dataset.catalog[0];
    if (!featured) throw new Error('No featured test anime is available.');
    return cloneAnime(featured);
  }

  async getPopular(): Promise<AnimeCatalogItem[]> {
    return this.dataset.catalog.slice(1, 13).map(cloneAnime);
  }

  async getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.dataset.catalog.slice(13, 25).map(cloneAnime);
  }

  async getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.dataset.catalog.slice(25, 37).map(cloneAnime);
  }

  async search(query: string): Promise<AnimeCatalogItem[]> {
    const normalized = query.trim().toLocaleLowerCase();
    const items = normalized
      ? this.dataset.catalog.filter(
          (anime) =>
            anime.title.toLocaleLowerCase().includes(normalized) ||
            anime.alternativeTitles.some((title) =>
              title.toLocaleLowerCase().includes(normalized),
            ),
        )
      : this.dataset.catalog.slice(0, 18);
    return items.map(cloneAnime);
  }

  async getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    const wanted = new Set(ids);
    return this.dataset.catalog
      .filter((anime) => wanted.has(anime.id))
      .map(cloneAnime);
  }

  async getDetailsById(id: number): Promise<AnimeCatalogItem | null> {
    return this.getKnownById(id);
  }

  getKnownById(id: number): AnimeCatalogItem | null {
    const anime = this.dataset.catalog.find((item) => item.id === id);
    return anime ? cloneAnime(anime) : null;
  }

  clearCache(): void {}
}

export class InMemoryUserAnimeListRepository implements UserAnimeListRepository {
  constructor(private readonly dataset: TestAnimeDataset) {}

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    validatePageRequest(request);
    const filtered = request.status
      ? this.dataset.userEntries.filter(
          (entry) => entry.status === request.status,
        )
      : this.dataset.userEntries;
    const start = (request.page - 1) * request.pageSize;
    const end = start + request.pageSize;
    return {
      items: filtered.slice(start, end).map((entry) => ({ ...entry })),
      page: request.page,
      nextPage: end < filtered.length ? request.page + 1 : null,
      totalCount: filtered.length,
    };
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    const entry = this.findEntry(animeId);
    return entry ? { ...entry } : null;
  }

  async addToList(
    animeId: number,
    status: AnimeListStatus = 'plan_to_watch',
  ): Promise<UserAnimeEntry> {
    const existing = this.findEntry(animeId);
    if (existing) return { ...existing };
    const anime = this.getAnime(animeId);
    const entry = transitionStatus(
      {
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: new Date(Date.UTC(2026, 0, 1, 12, animeId)).toISOString(),
      },
      status,
      anime.totalEpisodes,
    );
    return this.save(entry);
  }

  async removeFromList(animeId: number): Promise<void> {
    const index = this.dataset.userEntries.findIndex(
      (entry) => entry.animeId === animeId,
    );
    if (index >= 0) this.dataset.userEntries.splice(index, 1);
  }

  async updateProgress(
    animeId: number,
    episodes: number,
  ): Promise<UserAnimeEntry> {
    const entry = this.requireEntry(animeId);
    return this.save(
      applyProgress(entry, episodes, this.getAnime(animeId).totalEpisodes),
    );
  }

  async updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    const entry = this.requireEntry(animeId);
    return this.save(
      transitionStatus(entry, status, this.getAnime(animeId).totalEpisodes),
    );
  }

  async updateScore(
    animeId: number,
    score: number | null,
  ): Promise<UserAnimeEntry> {
    return this.save({
      ...this.requireEntry(animeId),
      userScore: validateUserScore(score),
    });
  }

  private getAnime(animeId: number): AnimeCatalogItem {
    const anime = this.dataset.catalog.find((item) => item.id === animeId);
    if (!anime) throw new DomainError(`Anime ${animeId} was not found.`);
    return anime;
  }

  private findEntry(animeId: number): UserAnimeEntry | undefined {
    return this.dataset.userEntries.find((entry) => entry.animeId === animeId);
  }

  private requireEntry(animeId: number): UserAnimeEntry {
    const entry = this.findEntry(animeId);
    if (!entry) throw new DomainError(`Anime ${animeId} is not in My List.`);
    return entry;
  }

  private save(entry: UserAnimeEntry): UserAnimeEntry {
    const index = this.dataset.userEntries.findIndex(
      (current) => current.animeId === entry.animeId,
    );
    if (index >= 0) this.dataset.userEntries[index] = entry;
    else this.dataset.userEntries.push(entry);
    return { ...entry };
  }
}
