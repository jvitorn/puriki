import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { JikanCatalogCache } from '@/infrastructure/api/jikan/jikan-cache';
import {
  createJikanClient,
  executeJikanRequest,
  type JikanClientPort,
} from '@/infrastructure/api/jikan/jikan-client';
import {
  isJikanAnimeCollectionResponse,
  isJikanSingleAnimeResponse,
  type JikanAnimeDto,
  type JikanCollectionResponse,
} from '@/infrastructure/api/jikan/jikan-dtos';
import {
  JikanNotFoundError,
  JikanResponseFormatError,
} from '@/infrastructure/api/jikan/jikan-errors';
import { mapJikanAnime } from '@/infrastructure/api/jikan/jikan-mapper';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import {
  JIKAN_DISCOVERY_OPERATION_FAMILIES,
  type JikanDiscoveryOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { normalizeSearchText } from '@/shared/utils/search';

export type RandomGenerator = () => number;

export interface JikanAnimeCatalogRepositoryOptions {
  client?: JikanClientPort;
  cache?: JikanCatalogCache;
  random?: RandomGenerator;
  scheduler?: JikanRequestScheduler;
  sleep?: (milliseconds: number) => Promise<void>;
  maximumAttempts?: number;
}

type AnimeCollectionRequest = () => Promise<unknown>;
type DiscoveryCollectionName = JikanDiscoveryOperationFamily;

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

function deduplicate(items: readonly AnimeCatalogItem[]): AnimeCatalogItem[] {
  const byId = new Map<number, AnimeCatalogItem>();
  items.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return [...byId.values()];
}

export class JikanAnimeCatalogRepository implements AnimeCatalogRepository {
  private readonly client: JikanClientPort;
  private readonly cache: JikanCatalogCache;
  private readonly random: RandomGenerator;
  private readonly scheduler: JikanRequestScheduler;
  private readonly sleep?: (milliseconds: number) => Promise<void>;
  private readonly maximumAttempts?: number;
  private readonly sessionCollections = new Map<string, AnimeCatalogItem[]>();
  private sessionPool: AnimeCatalogItem[] | null = null;
  private featured: AnimeCatalogItem | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private readonly familyRefreshes = new Map<
    DiscoveryCollectionName,
    Promise<void>
  >();
  private generation = 0;

  constructor(options: JikanAnimeCatalogRepositoryOptions = {}) {
    this.client = options.client ?? createJikanClient();
    this.cache = options.cache ?? new JikanCatalogCache();
    this.random = options.random ?? Math.random;
    this.scheduler = options.scheduler ?? new JikanRequestScheduler();
    this.sleep = options.sleep;
    this.maximumAttempts = options.maximumAttempts;
  }

  async getFeatured(): Promise<AnimeCatalogItem> {
    if (this.featured) return this.featured;
    const generation = this.generation;
    const pool = await this.getSessionPool();
    const preferred = pool.find(
      (anime) =>
        anime.synopsis.length > 0 &&
        anime.score !== null &&
        (anime.heroImageUrl !== null || anime.largePosterImageUrl !== null),
    );
    const featured = preferred ?? pool[0];
    if (!featured) {
      throw new JikanResponseFormatError(
        'Jikan returned an empty discovery catalog.',
      );
    }
    if (generation === this.generation) this.featured = featured;
    return featured;
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('popular', () =>
      this.client.top.getTopAnime(),
    );
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('seasonal', () =>
      this.client.seasons.getSeasonNow(),
    );
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('upcoming', () =>
      this.client.seasons.getSeasonUpcoming(),
    );
  }

  search(query: string): Promise<AnimeCatalogItem[]> {
    const normalizedQuery = normalizeSearchText(query);
    return this.fetchCollection(`search:${normalizedQuery}`, () =>
      this.client.anime.getAnimeSearch({
        limit: 25,
        order_by: 'popularity',
        q: normalizedQuery,
        sfw: true,
        sort: 'asc',
      }),
    );
  }

  async getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    const uniqueIds = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ];
    const resolved = new Map<number, AnimeCatalogItem>();
    const missing: number[] = [];
    uniqueIds.forEach((id) => {
      const summary = this.cache.getSummary(id);
      if (summary) resolved.set(id, summary);
      else missing.push(id);
    });
    for (const id of missing) {
      const item = await this.getDetailsById(id);
      if (item) resolved.set(item.id, item);
    }
    return uniqueIds.flatMap((id) => {
      const item = resolved.get(id);
      return item ? [item] : [];
    });
  }

  getDetailsById(id: number): Promise<AnimeCatalogItem | null> {
    if (this.cache.hasDetail(id)) {
      return Promise.resolve(this.cache.getDetail(id) ?? null);
    }
    const generation = this.generation;
    return this.cache.getOrCreate(`detail:${id}`, async () => {
      try {
        const response = await this.executeRequest(
          `detail:${id}`,
          () => this.client.anime.getAnimeFullById(id),
          isJikanSingleAnimeResponse,
        );
        const item = mapJikanAnime(response.data, 'details');
        if (generation === this.generation) this.cache.setDetail(id, item);
        return item;
      } catch (error: unknown) {
        if (error instanceof JikanNotFoundError) {
          if (generation === this.generation) this.cache.setDetail(id, null);
          return null;
        }
        throw error;
      }
    });
  }

  getKnownById(id: number): AnimeCatalogItem | null {
    return this.cache.getSummary(id) ?? null;
  }

  refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const refresh = this.refreshDiscoveryCollections();
    this.refreshInFlight = refresh;
    void refresh.then(
      () => this.clearRefreshIfCurrent(refresh),
      () => this.clearRefreshIfCurrent(refresh),
    );
    return refresh;
  }

  refreshFamily(family: DiscoveryCollectionName): Promise<void> {
    const existing = this.familyRefreshes.get(family);
    if (existing) return existing;
    const refresh = this.refreshDiscoveryCollection(family, this.generation);
    this.familyRefreshes.set(family, refresh);
    void refresh.then(
      () => this.clearFamilyRefreshIfCurrent(family, refresh),
      () => this.clearFamilyRefreshIfCurrent(family, refresh),
    );
    return refresh;
  }

  clearCache(): void {
    this.generation += 1;
    this.cache.clear();
    this.sessionCollections.clear();
    this.sessionPool = null;
    this.featured = null;
  }

  private async getSessionCollection(
    name: string,
    request: AnimeCollectionRequest,
  ): Promise<AnimeCatalogItem[]> {
    const existing = this.sessionCollections.get(name);
    if (existing) return existing;
    const generation = this.generation;
    const collection = await this.fetchCollection(name, request);
    if (generation !== this.generation)
      return shuffled(collection, this.random);
    const concurrent = this.sessionCollections.get(name);
    if (concurrent) return concurrent;
    const randomized = shuffled(collection, this.random);
    this.sessionCollections.set(name, randomized);
    return randomized;
  }

  private async getSessionPool(): Promise<AnimeCatalogItem[]> {
    if (this.sessionPool) return this.sessionPool;
    const generation = this.generation;
    const results = await Promise.allSettled([
      this.getPopular(),
      this.getSeasonal(),
      this.getUpcoming(),
    ]);
    const collections = results.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (collections.length === 0) {
      const failure = results.find((result) => result.status === 'rejected');
      throw failure?.reason ?? new Error('Jikan returned no collections.');
    }
    if (generation !== this.generation) {
      return shuffled(deduplicate(collections.flat()), this.random);
    }
    const concurrent = this.sessionPool;
    if (concurrent) return concurrent;
    const pool = shuffled(deduplicate(collections.flat()), this.random);
    this.sessionPool = pool;
    return pool;
  }

  private fetchCollection(
    name: string,
    request: AnimeCollectionRequest,
  ): Promise<AnimeCatalogItem[]> {
    const key = `collection:${name}`;
    const cached = this.cache.getCollection(key);
    if (cached) return Promise.resolve(cached);
    const generation = this.generation;
    return this.cache.getOrCreate(key, async () => {
      const response = await this.executeRequest<
        JikanCollectionResponse<JikanAnimeDto>
      >(name, request, isJikanAnimeCollectionResponse);
      const items = deduplicate(response.data.map((dto) => mapJikanAnime(dto)));
      if (generation === this.generation) this.cache.setCollection(key, items);
      return items;
    });
  }

  private async fetchFreshCollection(
    name: DiscoveryCollectionName,
    request: AnimeCollectionRequest,
  ): Promise<AnimeCatalogItem[]> {
    const response = await this.executeRequest<
      JikanCollectionResponse<JikanAnimeDto>
    >(name, request, isJikanAnimeCollectionResponse);
    return deduplicate(response.data.map((dto) => mapJikanAnime(dto)));
  }

  private async refreshDiscoveryCollections(): Promise<void> {
    const results = await Promise.allSettled(
      JIKAN_DISCOVERY_OPERATION_FAMILIES.map((family) =>
        this.refreshFamily(family),
      ),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }

  private async refreshDiscoveryCollection(
    family: DiscoveryCollectionName,
    generation: number,
  ): Promise<void> {
    const request =
      family === 'popular'
        ? () => this.client.top.getTopAnime()
        : family === 'seasonal'
          ? () => this.client.seasons.getSeasonNow()
          : () => this.client.seasons.getSeasonUpcoming();
    const items = await this.fetchFreshCollection(family, request);
    if (items.length === 0) {
      throw new JikanResponseFormatError(
        `Jikan returned an empty ${family} collection during refresh.`,
      );
    }
    if (generation !== this.generation) {
      throw new Error('The catalog cache changed while refresh was running.');
    }
    this.cache.replaceCollection(`collection:${family}`, items);
    this.sessionCollections.set(family, shuffled(items, this.random));
    this.sessionPool = null;
    this.featured = null;
  }

  private executeRequest<T>(
    key: string,
    request: AnimeCollectionRequest,
    validator: (value: unknown) => value is T,
  ): Promise<T> {
    return executeJikanRequest(request, validator, {
      key,
      maximumAttempts: this.maximumAttempts,
      random: this.random,
      sleep: this.sleep,
      runAttempt: (_attempt, operation) =>
        this.scheduler.schedule(key, operation),
    });
  }

  private clearRefreshIfCurrent(refresh: Promise<void>): void {
    if (this.refreshInFlight === refresh) this.refreshInFlight = null;
  }

  private clearFamilyRefreshIfCurrent(
    family: DiscoveryCollectionName,
    refresh: Promise<void>,
  ): void {
    if (this.familyRefreshes.get(family) === refresh) {
      this.familyRefreshes.delete(family);
    }
  }
}
