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
import type { RandomGenerator } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';

export interface SessionUserAnimeListRepositoryOptions {
  random?: RandomGenerator;
  now?: () => Date;
}

function cloneEntries(entries: readonly UserAnimeEntry[]): UserAnimeEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function deduplicate(items: readonly AnimeCatalogItem[]): AnimeCatalogItem[] {
  const byId = new Map<number, AnimeCatalogItem>();
  items.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return [...byId.values()];
}

function shuffled<T>(items: readonly T[], random: RandomGenerator): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = result[index];
    const swap = result[swapIndex];
    if (current === undefined || swap === undefined) continue;
    result[index] = swap;
    result[swapIndex] = current;
  }
  return result;
}

export class SessionUserAnimeListRepository implements UserAnimeListRepository {
  private entries: UserAnimeEntry[] | null = null;
  private initialEntries: UserAnimeEntry[] = [];
  private initialization: Promise<void> | null = null;
  private readonly random: RandomGenerator;
  private readonly now: () => Date;

  constructor(
    private readonly catalogRepository: AnimeCatalogRepository,
    options: SessionUserAnimeListRepositoryOptions = {},
  ) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    validatePageRequest(request);
    await this.ensureInitialized();
    const filtered = request.status
      ? (this.entries ?? []).filter((entry) => entry.status === request.status)
      : (this.entries ?? []);
    const start = (request.page - 1) * request.pageSize;
    const end = start + request.pageSize;
    return {
      items: cloneEntries(filtered.slice(start, end)),
      page: request.page,
      nextPage: end < filtered.length ? request.page + 1 : null,
      totalCount: filtered.length,
    };
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    await this.ensureInitialized();
    const entry = this.findEntry(animeId);
    return entry ? { ...entry } : null;
  }

  async updateProgress(
    animeId: number,
    episodes: number,
  ): Promise<UserAnimeEntry> {
    const { anime, entry } = await this.resolveForUpdate(animeId);
    return this.save({
      ...applyProgress(entry, episodes, anime.totalEpisodes),
      updatedAt: this.now().toISOString(),
    });
  }

  async updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    const { anime, entry } = await this.resolveForUpdate(animeId);
    return this.save({
      ...transitionStatus(entry, status, anime.totalEpisodes),
      updatedAt: this.now().toISOString(),
    });
  }

  async updateScore(
    animeId: number,
    score: number | null,
  ): Promise<UserAnimeEntry> {
    const { entry } = await this.resolveForUpdate(animeId);
    return this.save({
      ...entry,
      userScore: validateUserScore(score),
      updatedAt: this.now().toISOString(),
    });
  }

  async reset(): Promise<void> {
    await this.ensureInitialized();
    this.entries = cloneEntries(this.initialEntries);
  }

  async generateNewSample(): Promise<void> {
    await this.ensureInitialized();
    const nextEntries = await this.buildSample();
    this.entries = nextEntries;
    this.initialEntries = cloneEntries(nextEntries);
  }

  private ensureInitialized(): Promise<void> {
    if (this.entries) return Promise.resolve();
    if (this.initialization) return this.initialization;
    this.initialization = this.initialize().finally(() => {
      this.initialization = null;
    });
    return this.initialization;
  }

  private async initialize(): Promise<void> {
    const entries = await this.buildSample();
    this.entries = entries;
    this.initialEntries = cloneEntries(entries);
  }

  private async buildSample(): Promise<UserAnimeEntry[]> {
    const results = await Promise.allSettled([
      this.catalogRepository.getPopular(),
      this.catalogRepository.getSeasonal(),
      this.catalogRepository.getUpcoming(),
    ]);
    const collections = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (collections.length === 0) {
      const failure = results.find((result) => result.status === 'rejected');
      throw failure?.reason ?? new Error('Jikan returned no collections.');
    }
    const candidates = shuffled(deduplicate(collections.flat()), this.random);
    const targetSize = Math.min(
      candidates.length,
      22 + Math.floor(this.random() * 4),
    );
    const selected = candidates.slice(0, targetSize);
    const unknownEpisodes = candidates.find(
      (anime) => anime.totalEpisodes === null,
    );
    if (
      unknownEpisodes &&
      selected.length > 0 &&
      !selected.some((anime) => anime.id === unknownEpisodes.id)
    ) {
      selected[selected.length - 1] = unknownEpisodes;
    }
    const catalog = await this.catalogRepository.getManyByIds(
      selected.map((anime) => anime.id),
    );
    return catalog.map((anime, index) => this.createEntry(anime, index));
  }

  private createEntry(anime: AnimeCatalogItem, index: number): UserAnimeEntry {
    const status =
      ANIME_STATUSES[index % ANIME_STATUSES.length] ?? 'plan_to_watch';
    return {
      animeId: anime.id,
      status,
      watchedEpisodes: this.progressFor(status, anime.totalEpisodes),
      userScore: index % 3 === 0 ? 1 + Math.floor(this.random() * 10) : null,
      updatedAt: this.now().toISOString(),
    };
  }

  private progressFor(
    status: AnimeListStatus,
    totalEpisodes: number | null,
  ): number {
    if (status === 'plan_to_watch') return 0;
    if (status === 'completed') {
      return totalEpisodes ?? 1 + Math.floor(this.random() * 24);
    }
    if (totalEpisodes === null) return Math.floor(this.random() * 13);
    const maximum = Math.max(0, totalEpisodes - 1);
    return Math.floor(this.random() * (maximum + 1));
  }

  private async resolveForUpdate(animeId: number): Promise<{
    anime: AnimeCatalogItem;
    entry: UserAnimeEntry;
  }> {
    await this.ensureInitialized();
    const [anime] = await this.catalogRepository.getManyByIds([animeId]);
    if (!anime) throw new DomainError(`Anime ${animeId} was not found.`);
    return {
      anime,
      entry: this.findEntry(animeId) ?? {
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: this.now().toISOString(),
      },
    };
  }

  private findEntry(animeId: number): UserAnimeEntry | undefined {
    return this.entries?.find((entry) => entry.animeId === animeId);
  }

  private save(entry: UserAnimeEntry): UserAnimeEntry {
    const entries = this.entries ?? [];
    const index = entries.findIndex(
      (current) => current.animeId === entry.animeId,
    );
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
    this.entries = entries;
    return { ...entry };
  }
}
