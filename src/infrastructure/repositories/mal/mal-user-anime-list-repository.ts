import { DomainError } from '@/domain/errors/domain-error';
import type {
  AnimeListStatus,
  AnimeTrackingContext,
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
import type { MalAuthenticatedClientPort } from '@/infrastructure/api/mal/mal-authenticated-client';
import {
  MalNotFoundError,
  MalUnauthorizedError,
} from '@/infrastructure/api/mal/mal-errors';
import {
  parseMalSavedListStatus,
  parseMalUserListPage,
} from '@/infrastructure/api/mal/mal-user-list-dtos';
import {
  mapDomainScoreToRaw,
  mapMalUserListEntry,
} from '@/infrastructure/api/mal/mal-user-list-mapper';

const DEFAULT_CACHE_TTL_MS = 30_000;
const MAL_LIST_PAGE_SIZE = 100;
const MAXIMUM_LIST_PAGES = 100;

export interface MalUserAnimeListRepositoryOptions {
  client: MalAuthenticatedClientPort;
  catalogRepository: AnimeCatalogRepository;
  cacheTtlMs?: number;
  now?: () => number;
  onUnauthorized?: () => Promise<void> | void;
}

function cloneEntry(entry: UserAnimeEntry): UserAnimeEntry {
  return { ...entry };
}

export class MalUserAnimeListRepository implements UserAnimeListRepository {
  private readonly client: MalAuthenticatedClientPort;
  private readonly catalogRepository: AnimeCatalogRepository;
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly onUnauthorized?: () => Promise<void> | void;
  private snapshot: UserAnimeEntry[] | null = null;
  private snapshotExpiresAt = 0;
  private inFlight: Promise<UserAnimeEntry[]> | null = null;
  private generation = 0;
  private readonly mutationTails = new Map<number, Promise<void>>();

  constructor(options: MalUserAnimeListRepositoryOptions) {
    this.client = options.client;
    this.catalogRepository = options.catalogRepository;
    this.cacheTtlMs = Math.max(0, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.now = options.now ?? Date.now;
    this.onUnauthorized = options.onUnauthorized;
  }

  private async trackingContext(
    animeId: number,
  ): Promise<AnimeTrackingContext> {
    const known = this.catalogRepository.getKnownById(animeId);
    const [resolved] = known
      ? []
      : await this.catalogRepository.getManyByIds([animeId]);
    const anime = known ?? resolved;
    if (!anime) throw new DomainError(`Anime ${animeId} was not found.`);
    return createAnimeTrackingContext(anime);
  }

  invalidateCache(): void {
    this.generation += 1;
    this.snapshot = null;
    this.snapshotExpiresAt = 0;
    this.inFlight = null;
  }

  async getPage(
    request: UserAnimeListPageRequest,
  ): Promise<PageResult<UserAnimeEntry>> {
    validatePageRequest(request);
    const snapshot = await this.getSnapshot();
    const filtered = request.status
      ? snapshot.filter((entry) => entry.status === request.status)
      : snapshot;
    const start = (request.page - 1) * request.pageSize;
    const end = start + request.pageSize;
    return {
      items: filtered.slice(start, end).map(cloneEntry),
      page: request.page,
      nextPage: end < filtered.length ? request.page + 1 : null,
      totalCount: filtered.length,
    };
  }

  async getByAnimeId(animeId: number): Promise<UserAnimeEntry | null> {
    const entry = this.findEntry(await this.getSnapshot(), animeId);
    return entry ? cloneEntry(entry) : null;
  }

  addToList(
    animeId: number,
    status: AnimeListStatus = 'plan_to_watch',
  ): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const existing = this.findEntry(await this.getSnapshot(), animeId);
      if (existing) return cloneEntry(existing);
      const transition = transitionStatus(
        {
          animeId,
          status: 'plan_to_watch',
          watchedEpisodes: 0,
          userScore: null,
          updatedAt: new Date(this.now()).toISOString(),
        },
        status,
        await this.trackingContext(animeId),
      );
      if (!transition.allowed) {
        throw new DomainError(
          `Status transition blocked: ${transition.reason}.`,
        );
      }
      const desired = transition.entry;
      const body: Record<string, string | number> = {
        status: desired.status,
      };
      if (desired.watchedEpisodes > 0) {
        body.num_watched_episodes = desired.watchedEpisodes;
      }
      const saved = await this.saveEntry(animeId, body);
      this.commitSavedEntry(saved);
      return cloneEntry(saved);
    });
  }

  removeFromList(animeId: number): Promise<void> {
    return this.serializeMutation(animeId, async () => {
      try {
        await this.executeMutation(() =>
          this.client.delete(this.entryPath(animeId)),
        );
      } catch (error: unknown) {
        if (!(error instanceof MalNotFoundError)) throw error;
      }
      if (this.snapshot) {
        this.snapshot = this.snapshot.filter(
          (entry) => entry.animeId !== animeId,
        );
        this.refreshSnapshotTtl();
      }
    });
  }

  updateProgress(animeId: number, episodes: number): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const current = await this.requireEntry(animeId);
      const desired = applyProgress(
        current,
        episodes,
        await this.trackingContext(animeId),
      );
      const body: Record<string, string | number> = {
        num_watched_episodes: desired.watchedEpisodes,
      };
      if (desired.status !== current.status) body.status = desired.status;
      const saved = await this.saveEntry(animeId, body);
      this.commitSavedEntry(saved);
      return cloneEntry(saved);
    });
  }

  updateStatus(
    animeId: number,
    status: AnimeListStatus,
  ): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      const current = await this.requireEntry(animeId);
      if (current.status === status) return cloneEntry(current);
      const transition = transitionStatus(
        current,
        status,
        await this.trackingContext(animeId),
      );
      if (!transition.allowed) {
        throw new DomainError(
          `Status transition blocked: ${transition.reason}.`,
        );
      }
      const desired = transition.entry;
      const body: Record<string, string | number> = {
        status: desired.status,
      };
      if (desired.watchedEpisodes !== current.watchedEpisodes) {
        body.num_watched_episodes = desired.watchedEpisodes;
      }
      const saved = await this.saveEntry(animeId, body);
      this.commitSavedEntry(saved);
      return cloneEntry(saved);
    });
  }

  updateScore(animeId: number, score: number | null): Promise<UserAnimeEntry> {
    return this.serializeMutation(animeId, async () => {
      await this.requireEntry(animeId);
      const validScore = validateUserScore(score);
      const saved = await this.saveEntry(animeId, {
        score: mapDomainScoreToRaw(validScore),
      });
      this.commitSavedEntry(saved);
      return cloneEntry(saved);
    });
  }

  private getSnapshot(): Promise<UserAnimeEntry[]> {
    if (this.snapshot && this.now() < this.snapshotExpiresAt) {
      return Promise.resolve(this.snapshot);
    }
    if (this.inFlight) return this.inFlight;
    const generation = this.generation;
    const request = this.fetchSnapshot();
    this.inFlight = request;
    void request.then(
      (entries) => {
        if (generation === this.generation) {
          this.snapshot = entries;
          this.refreshSnapshotTtl();
        }
        if (this.inFlight === request) this.inFlight = null;
      },
      () => {
        if (this.inFlight === request) this.inFlight = null;
      },
    );
    return request;
  }

  private async fetchSnapshot(): Promise<UserAnimeEntry[]> {
    try {
      const mapped: UserAnimeEntry[] = [];
      let offset: number | null = 0;
      for (let page = 1; page <= MAXIMUM_LIST_PAGES; page += 1) {
        const response = await this.client.get('/users/@me/animelist', {
          fields: 'list_status',
          limit: MAL_LIST_PAGE_SIZE,
          offset,
        });
        const parsed = parseMalUserListPage(response.data);
        parsed.entries.forEach((node) => {
          mapped.push(mapMalUserListEntry(node.animeId, node.status));
        });
        if (parsed.nextOffset === null) return mapped;
        offset = parsed.nextOffset;
      }
      throw new Error('MyAnimeList returned too many list pages.');
    } catch (error: unknown) {
      await this.handleUnauthorized(error);
      throw error;
    }
  }

  private async requireEntry(animeId: number): Promise<UserAnimeEntry> {
    const entry = this.findEntry(await this.getSnapshot(), animeId);
    if (!entry) throw new DomainError(`Anime ${animeId} is not in My List.`);
    return entry;
  }

  private findEntry(
    entries: readonly UserAnimeEntry[],
    animeId: number,
  ): UserAnimeEntry | undefined {
    return entries.find((entry) => entry.animeId === animeId);
  }

  private async saveEntry(
    animeId: number,
    body: Record<string, string | number>,
  ): Promise<UserAnimeEntry> {
    const response = await this.executeMutation(() =>
      this.client.patch(this.entryPath(animeId), body),
    );
    try {
      return mapMalUserListEntry(
        animeId,
        parseMalSavedListStatus(response.data),
      );
    } catch (error: unknown) {
      this.invalidateCache();
      throw error;
    }
  }

  private entryPath(animeId: number): string {
    return `/anime/${animeId}/my_list_status`;
  }

  private async executeMutation<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      this.invalidateCache();
      await this.handleUnauthorized(error);
      throw error;
    }
  }

  private async handleUnauthorized(error: unknown): Promise<void> {
    if (error instanceof MalUnauthorizedError) {
      await this.onUnauthorized?.();
    }
  }

  private commitSavedEntry(saved: UserAnimeEntry): void {
    if (!this.snapshot) return;
    const index = this.snapshot.findIndex(
      (entry) => entry.animeId === saved.animeId,
    );
    if (index >= 0) this.snapshot[index] = saved;
    else this.snapshot.push(saved);
    this.refreshSnapshotTtl();
  }

  private refreshSnapshotTtl(): void {
    this.snapshotExpiresAt = this.now() + this.cacheTtlMs;
  }

  private serializeMutation<T>(
    animeId: number,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.mutationTails.get(animeId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(animeId, tail);
    void tail.then(() => {
      if (this.mutationTails.get(animeId) === tail) {
        this.mutationTails.delete(animeId);
      }
    });
    return result;
  }
}
