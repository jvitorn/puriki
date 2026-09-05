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
import { createAnimeTrackingContext } from '@/domain/rules/anime-tracking';

export interface GuestUserAnimeListRepositoryOptions {
  now?: () => Date;
}

function cloneEntries(entries: readonly UserAnimeEntry[]): UserAnimeEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

export class GuestUserAnimeListRepository implements UserAnimeListRepository {
  private entries: UserAnimeEntry[] = [];
  private readonly now: () => Date;

  constructor(
    private readonly catalogRepository: AnimeCatalogRepository,
    options: GuestUserAnimeListRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  invalidateCache(): void {}

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    validatePageRequest(request);
    const filtered = request.status
      ? this.entries.filter((entry) => entry.status === request.status)
      : this.entries;
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
    const entry = this.findEntry(animeId);
    return entry ? { ...entry } : null;
  }

  async addToList(
    animeId: number,
    status: AnimeListStatus = 'plan_to_watch',
  ): Promise<UserAnimeEntry> {
    const existing = this.findEntry(animeId);
    if (existing) return { ...existing };
    const anime = this.catalogRepository.getKnownById(animeId);
    if (!anime) throw new DomainError(`Anime ${animeId} was not found.`);
    const transition = transitionStatus(
      {
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: this.now().toISOString(),
      },
      status,
      createAnimeTrackingContext(anime),
    );
    if (!transition.allowed) {
      throw new DomainError(`Status transition blocked: ${transition.reason}.`);
    }
    const created = transition.entry;
    return this.save({ ...created, updatedAt: this.now().toISOString() });
  }

  async removeFromList(animeId: number): Promise<void> {
    this.entries = this.entries.filter((entry) => entry.animeId !== animeId);
  }

  async updateProgress(
    animeId: number,
    episodes: number,
  ): Promise<UserAnimeEntry> {
    const { anime, entry } = await this.resolveForUpdate(animeId);
    return this.save({
      ...applyProgress(entry, episodes, createAnimeTrackingContext(anime)),
      updatedAt: this.now().toISOString(),
    });
  }

  async updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    const { anime, entry } = await this.resolveForUpdate(animeId);
    if (entry.status === status) return { ...entry };
    const transition = transitionStatus(
      entry,
      status,
      createAnimeTrackingContext(anime),
    );
    if (!transition.allowed) {
      throw new DomainError(`Status transition blocked: ${transition.reason}.`);
    }
    return this.save({
      ...transition.entry,
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

  private async resolveForUpdate(animeId: number): Promise<{
    anime: AnimeCatalogItem;
    entry: UserAnimeEntry;
  }> {
    const entry = this.findEntry(animeId);
    if (!entry) {
      throw new DomainError(`Anime ${animeId} is not in My List.`);
    }
    const known = this.catalogRepository.getKnownById(animeId);
    const [resolved] = known
      ? []
      : await this.catalogRepository.getManyByIds([animeId]);
    const anime = known ?? resolved;
    if (!anime) throw new DomainError(`Anime ${animeId} was not found.`);
    return { anime, entry };
  }

  private findEntry(animeId: number): UserAnimeEntry | undefined {
    return this.entries.find((entry) => entry.animeId === animeId);
  }

  private save(entry: UserAnimeEntry): UserAnimeEntry {
    const index = this.entries.findIndex(
      (current) => current.animeId === entry.animeId,
    );
    if (index >= 0) this.entries[index] = entry;
    else this.entries.push(entry);
    return { ...entry };
  }
}
