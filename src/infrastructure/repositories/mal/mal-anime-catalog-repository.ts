import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { MalCatalogCache } from '@/infrastructure/api/mal/mal-cache';
import {
  createMalClient,
  type MalAnimeSeason,
  type MalClientPort,
} from '@/infrastructure/api/mal/mal-client';
import {
  isMalCollectionResponse,
  isMalDetailResponse,
} from '@/infrastructure/api/mal/mal-dtos';
import {
  MalNotFoundError,
  MalResponseFormatError,
} from '@/infrastructure/api/mal/mal-errors';
import { MAL_ANIME_FIELDS } from '@/infrastructure/api/mal/mal-fields';
import { mapMalAnime } from '@/infrastructure/api/mal/mal-mapper';
import { normalizeSearchText } from '@/shared/utils/search';

export type MalRandomGenerator = () => number;

export interface MalAnimeCatalogRepositoryOptions {
  client?: MalClientPort;
  cache?: MalCatalogCache;
  random?: MalRandomGenerator;
  now?: () => Date;
}

type CollectionName = 'popular' | 'seasonal' | 'upcoming';
type CollectionRequest = () => Promise<unknown>;

function deduplicate(items: readonly AnimeCatalogItem[]): AnimeCatalogItem[] {
  const byId = new Map<number, AnimeCatalogItem>();
  items.forEach((item) => {
    if (!byId.has(item.id)) byId.set(item.id, item);
  });
  return [...byId.values()];
}

function shuffled<T>(items: readonly T[], random: MalRandomGenerator): T[] {
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

export function currentMalSeason(date: Date): {
  year: number;
  season: MalAnimeSeason;
} {
  const month = date.getMonth();
  const season: MalAnimeSeason =
    month < 3 ? 'winter' : month < 6 ? 'spring' : month < 9 ? 'summer' : 'fall';
  return { year: date.getFullYear(), season };
}

export class MalAnimeCatalogRepository implements AnimeCatalogRepository {
  private readonly client: MalClientPort;
  private readonly cache: MalCatalogCache;
  private readonly random: MalRandomGenerator;
  private readonly now: () => Date;
  private readonly sessionCollections = new Map<string, AnimeCatalogItem[]>();
  private sessionPool: AnimeCatalogItem[] | null = null;
  private featured: AnimeCatalogItem | null = null;
  private refreshInFlight: Promise<void> | null = null;
  private generation = 0;

  constructor(options: MalAnimeCatalogRepositoryOptions = {}) {
    this.client = options.client ?? createMalClient();
    this.cache = options.cache ?? new MalCatalogCache();
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => new Date());
  }

  async getFeatured(): Promise<AnimeCatalogItem> {
    if (this.featured) return this.featured;
    const generation = this.generation;
    const pool = await this.getSessionPool();
    const preferred = pool.find(
      (anime) =>
        anime.synopsis.length > 0 &&
        anime.score !== null &&
        anime.largePosterImageUrl !== null,
    );
    const featured = preferred ?? pool[0];
    if (!featured) {
      throw new MalResponseFormatError(
        'MyAnimeList returned an empty discovery catalog.',
      );
    }
    if (generation === this.generation) this.featured = featured;
    return featured;
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('popular', () =>
      this.client.anime.getRanking({
        ranking_type: 'bypopularity',
        limit: 25,
        fields: MAL_ANIME_FIELDS,
      }),
    );
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('seasonal', () => {
      const { year, season } = currentMalSeason(this.now());
      return this.client.anime.getSeason(year, season, {
        limit: 25,
        sort: 'anime_num_list_users',
        fields: MAL_ANIME_FIELDS,
      });
    });
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('upcoming', () =>
      this.client.anime.getRanking({
        ranking_type: 'upcoming',
        limit: 25,
        fields: MAL_ANIME_FIELDS,
      }),
    );
  }

  search(query: string): Promise<AnimeCatalogItem[]> {
    const normalizedQuery = normalizeSearchText(query);
    if (normalizedQuery.length < 2) return this.getPopular();
    return this.fetchCollection(`search:${normalizedQuery}`, () =>
      this.client.anime.search({
        q: normalizedQuery,
        limit: 25,
        fields: MAL_ANIME_FIELDS,
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
    const fetched = await Promise.all(
      missing.map((id) => this.getDetailsById(id)),
    );
    fetched.forEach((item) => {
      if (item) resolved.set(item.id, item);
    });
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
        const response = await this.client.anime.getDetails(
          id,
          MAL_ANIME_FIELDS,
        );
        if (!isMalDetailResponse(response)) throw new MalResponseFormatError();
        const item = mapMalAnime(response);
        if (generation === this.generation) this.cache.setDetail(id, item);
        return item;
      } catch (error: unknown) {
        if (error instanceof MalNotFoundError) {
          if (generation === this.generation) this.cache.setDetail(id, null);
          return null;
        }
        throw error;
      }
    });
  }

  refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const refresh = this.refreshCollections(this.generation);
    this.refreshInFlight = refresh;
    void refresh.then(
      () => this.clearRefreshIfCurrent(refresh),
      () => this.clearRefreshIfCurrent(refresh),
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
    name: CollectionName,
    request: CollectionRequest,
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
      throw (
        failure?.reason ?? new Error('MyAnimeList returned no collections.')
      );
    }
    const combined = deduplicate(collections.flat());
    if (generation !== this.generation) return shuffled(combined, this.random);
    const concurrent = this.sessionPool;
    if (concurrent) return concurrent;
    this.sessionPool = shuffled(combined, this.random);
    return this.sessionPool;
  }

  private fetchCollection(
    name: string,
    request: CollectionRequest,
  ): Promise<AnimeCatalogItem[]> {
    const key = `collection:${name}`;
    const cached = this.cache.getCollection(key);
    if (cached) return Promise.resolve(cached);
    const generation = this.generation;
    return this.cache.getOrCreate(key, async () => {
      const response = await request();
      const items = this.mapCollection(response);
      if (generation === this.generation) this.cache.setCollection(key, items);
      return items;
    });
  }

  private async fetchFreshCollection(
    request: CollectionRequest,
  ): Promise<AnimeCatalogItem[]> {
    return this.mapCollection(await request());
  }

  private mapCollection(response: unknown): AnimeCatalogItem[] {
    if (!isMalCollectionResponse(response)) throw new MalResponseFormatError();
    return deduplicate(response.data.map((edge) => mapMalAnime(edge.node)));
  }

  private async refreshCollections(generation: number): Promise<void> {
    const { year, season } = currentMalSeason(this.now());
    const [popular, seasonal, upcoming] = await Promise.allSettled([
      this.fetchFreshCollection(() =>
        this.client.anime.getRanking({
          ranking_type: 'bypopularity',
          limit: 25,
          fields: MAL_ANIME_FIELDS,
        }),
      ),
      this.fetchFreshCollection(() =>
        this.client.anime.getSeason(year, season, {
          limit: 25,
          sort: 'anime_num_list_users',
          fields: MAL_ANIME_FIELDS,
        }),
      ),
      this.fetchFreshCollection(() =>
        this.client.anime.getRanking({
          ranking_type: 'upcoming',
          limit: 25,
          fields: MAL_ANIME_FIELDS,
        }),
      ),
    ]);
    const failed = [popular, seasonal, upcoming].find(
      (result) => result.status === 'rejected',
    );
    if (failed?.status === 'rejected') throw failed.reason;
    if (
      popular.status !== 'fulfilled' ||
      seasonal.status !== 'fulfilled' ||
      upcoming.status !== 'fulfilled'
    ) {
      throw new Error('MyAnimeList refresh did not finish.');
    }
    const freshCollections: (readonly [CollectionName, AnimeCatalogItem[]])[] =
      [
        ['popular', popular.value],
        ['seasonal', seasonal.value],
        ['upcoming', upcoming.value],
      ];
    if (freshCollections.every(([, items]) => items.length === 0)) {
      throw new MalResponseFormatError(
        'MyAnimeList returned an empty discovery catalog during refresh.',
      );
    }
    if (generation !== this.generation) {
      throw new Error(
        'The MAL catalog cache changed while refresh was running.',
      );
    }
    this.cache.replaceCollections(
      freshCollections.map(([name, items]) => [`collection:${name}`, items]),
    );
    freshCollections.forEach(([name, items]) =>
      this.sessionCollections.set(name, shuffled(items, this.random)),
    );
    this.sessionPool = shuffled(
      deduplicate(freshCollections.flatMap(([, items]) => items)),
      this.random,
    );
    this.featured = null;
  }

  private clearRefreshIfCurrent(refresh: Promise<void>): void {
    if (this.refreshInFlight === refresh) this.refreshInFlight = null;
  }
}
