import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { AniListCatalogCache } from '@/infrastructure/api/anilist/anilist-cache';
import {
  createAniListClient,
  executeAniListRequest,
  type AniListClientPort,
  type AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  parseAniListNullableDetailsData,
  parseAniListPageAlias,
  parseAniListPageData,
  type AniListMediaSummary,
} from '@/infrastructure/api/anilist/anilist-dtos';
import {
  AniListGraphQLExecutionError,
  AniListResponseFormatError,
  type AniListRequestDiagnostic,
} from '@/infrastructure/api/anilist/anilist-errors';
import {
  AniListMediaIdentityRegistry,
  type AniListMediaIdentityResolver,
} from '@/infrastructure/api/anilist/anilist-media-identity';
import {
  mapAniListDetails,
  mapAniListSummary,
} from '@/infrastructure/api/anilist/anilist-mapper';
import {
  ANILIST_COMBINED_HOME_QUERY,
  ANILIST_BY_MAL_IDS_QUERY,
  ANILIST_DETAILS_QUERY,
  ANILIST_POPULAR_QUERY,
  ANILIST_SEARCH_QUERY,
  ANILIST_SEASONAL_QUERY,
  ANILIST_UPCOMING_QUERY,
} from '@/infrastructure/api/anilist/anilist-queries';
import type { RandomGenerator } from '@/infrastructure/repositories/catalog/catalog-utils';
import {
  CATALOG_DISCOVERY_OPERATION_FAMILIES,
  type CatalogDiscoveryOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { normalizeSearchText } from '@/shared/utils/search';

export interface AniListAnimeCatalogRepositoryOptions {
  client?: AniListClientPort;
  cache?: AniListCatalogCache;
  random?: RandomGenerator;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  maximumAttempts?: number;
  mediaIdentityResolver?: AniListMediaIdentityResolver;
}

type FamilyResult =
  | { items: AnimeCatalogItem[]; error?: never }
  | { items?: never; error: unknown };

type DiscoverySnapshot = Record<CatalogDiscoveryOperationFamily, FamilyResult>;

interface LocalSeason {
  season: 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';
  year: number;
}

function currentLocalSeason(now: () => number): LocalSeason {
  const date = new Date(now());
  const month = date.getMonth();
  if (month === 11 || month <= 1) {
    return { season: 'WINTER', year: date.getFullYear() };
  }
  if (month <= 4) return { season: 'SPRING', year: date.getFullYear() };
  if (month <= 7) return { season: 'SUMMER', year: date.getFullYear() };
  return { season: 'FALL', year: date.getFullYear() };
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

function deduplicate(items: readonly AnimeCatalogItem[]): AnimeCatalogItem[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function mapSummaries(
  media: readonly AniListMediaSummary[],
  identityResolver: AniListMediaIdentityResolver,
): AnimeCatalogItem[] {
  return deduplicate(
    media.flatMap((dto) => {
      rememberIdentity(identityResolver, dto);
      const item = mapAniListSummary(dto);
      return item ? [item] : [];
    }),
  );
}

function rememberIdentity(
  resolver: AniListMediaIdentityResolver,
  dto: Pick<AniListMediaSummary, 'id' | 'idMal' | 'episodes'>,
): void {
  if (dto.idMal === null) return;
  resolver.remember({
    animeId: dto.idMal,
    mediaId: dto.id,
    totalEpisodes:
      dto.episodes !== null &&
      Number.isInteger(dto.episodes) &&
      dto.episodes > 0
        ? dto.episodes
        : null,
  });
}

function diagnostic(response: AniListClientResponse): AniListRequestDiagnostic {
  return {
    status: response.status,
    elapsedMs: response.elapsedMs,
    rateLimit: response.rateLimit,
    graphqlErrors: response.errors.map(({ message }) => message),
  };
}

function graphQLErrorFor(
  response: AniListClientResponse,
  family?: CatalogDiscoveryOperationFamily,
): AniListGraphQLExecutionError | null {
  const matching = response.errors.find(
    (error) =>
      error.path.length === 0 ||
      family === undefined ||
      error.path[0] === family,
  );
  return matching
    ? new AniListGraphQLExecutionError(matching.message, diagnostic(response))
    : null;
}

export class AniListAnimeCatalogRepository implements AnimeCatalogRepository {
  private readonly client: AniListClientPort;
  private readonly cache: AniListCatalogCache;
  private readonly random: RandomGenerator;
  private readonly now: () => number;
  private readonly sleep?: (milliseconds: number) => Promise<void>;
  private readonly maximumAttempts?: number;
  private readonly mediaIdentityResolver: AniListMediaIdentityResolver;
  private readonly sessionCollections = new Map<
    CatalogDiscoveryOperationFamily,
    AnimeCatalogItem[]
  >();
  private readonly familyErrors = new Map<
    CatalogDiscoveryOperationFamily,
    unknown
  >();
  private discoveryInFlight: Promise<DiscoverySnapshot> | null = null;
  private discoveryLoaded = false;
  private sessionPool: AnimeCatalogItem[] | null = null;
  private featured: AnimeCatalogItem | null = null;
  private readonly familyRefreshes = new Map<
    CatalogDiscoveryOperationFamily,
    Promise<void>
  >();
  private generation = 0;

  constructor(options: AniListAnimeCatalogRepositoryOptions = {}) {
    this.client = options.client ?? createAniListClient();
    this.cache = options.cache ?? new AniListCatalogCache();
    this.random = options.random ?? Math.random;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep;
    this.maximumAttempts = options.maximumAttempts;
    this.mediaIdentityResolver =
      options.mediaIdentityResolver ??
      new AniListMediaIdentityRegistry({
        client: this.client,
        maximumAttempts: this.maximumAttempts,
        sleep: this.sleep,
      });
  }

  async getFeatured(): Promise<AnimeCatalogItem> {
    if (this.featured) return this.featured;
    const generation = this.generation;
    const pool = await this.getSessionPool();
    const featured =
      pool.find(
        (anime) =>
          anime.title.length > 0 &&
          anime.score !== null &&
          anime.posterImageUrl !== null &&
          anime.heroImageUrl !== null,
      ) ??
      pool.find(
        (anime) =>
          anime.title.length > 0 &&
          anime.score !== null &&
          anime.posterImageUrl !== null,
      ) ??
      pool[0];
    if (!featured) {
      throw new AniListResponseFormatError(
        'AniList returned an empty discovery catalog.',
      );
    }
    if (generation === this.generation) this.featured = featured;
    return featured;
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('popular');
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('seasonal');
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.getSessionCollection('upcoming');
  }

  search(query: string): Promise<AnimeCatalogItem[]> {
    const normalized = normalizeSearchText(query);
    return this.fetchCollection(`search:${normalized}`, ANILIST_SEARCH_QUERY, {
      search: normalized,
      page: 1,
      perPage: 25,
    });
  }

  async getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    const uniqueIds = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ];
    const resolved = new Map<number, AnimeCatalogItem>();
    const missingIds = uniqueIds.filter((id) => {
      const known = this.cache.getSummary(id);
      if (known) resolved.set(id, known);
      return !known;
    });
    const batches = Array.from(
      { length: Math.ceil(missingIds.length / 50) },
      (_, index) => missingIds.slice(index * 50, index * 50 + 50),
    );
    const fetched = await Promise.all(
      batches.map((batch) =>
        this.fetchCollection(
          `mal-ids:${batch.join(',')}`,
          ANILIST_BY_MAL_IDS_QUERY,
          { ids: batch, perPage: batch.length },
        ),
      ),
    );
    fetched.flat().forEach((item) => resolved.set(item.id, item));
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
      const response = await this.execute(
        `detail:${id}`,
        ANILIST_DETAILS_QUERY,
        {
          idMal: id,
        },
      );
      const executionError = graphQLErrorFor(response);
      if (executionError) throw executionError;
      let dto;
      try {
        dto = parseAniListNullableDetailsData(response.data);
      } catch (error: unknown) {
        throw new AniListResponseFormatError(
          error instanceof Error ? error.message : undefined,
          diagnostic(response),
        );
      }
      if (dto) rememberIdentity(this.mediaIdentityResolver, dto);
      const item = dto ? mapAniListDetails(dto) : null;
      if (generation === this.generation) this.cache.setDetail(id, item);
      return item;
    });
  }

  getKnownById(id: number): AnimeCatalogItem | null {
    return this.cache.getSummary(id) ?? null;
  }

  async refresh(): Promise<void> {
    const results = await Promise.allSettled(
      CATALOG_DISCOVERY_OPERATION_FAMILIES.map((family) =>
        this.refreshFamily(family),
      ),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  refreshFamily(family: CatalogDiscoveryOperationFamily): Promise<void> {
    const existing = this.familyRefreshes.get(family);
    if (existing) return existing;
    const generation = this.generation;
    const refresh = this.refreshDiscoveryFamily(family, generation);
    this.familyRefreshes.set(family, refresh);
    void refresh.then(
      () => this.clearFamilyRefresh(family, refresh),
      () => this.clearFamilyRefresh(family, refresh),
    );
    return refresh;
  }

  clearCache(): void {
    this.generation += 1;
    this.cache.clear();
    this.sessionCollections.clear();
    this.familyErrors.clear();
    this.discoveryInFlight = null;
    this.discoveryLoaded = false;
    this.sessionPool = null;
    this.featured = null;
    this.mediaIdentityResolver.clear();
  }

  private async getSessionCollection(
    family: CatalogDiscoveryOperationFamily,
  ): Promise<AnimeCatalogItem[]> {
    const existing = this.sessionCollections.get(family);
    if (existing) return existing;
    if (!this.discoveryLoaded) await this.loadDiscovery();
    const error = this.familyErrors.get(family);
    if (error) throw error;
    return this.sessionCollections.get(family) ?? [];
  }

  private loadDiscovery(): Promise<DiscoverySnapshot> {
    if (this.discoveryInFlight) return this.discoveryInFlight;
    const generation = this.generation;
    const request = this.fetchDiscoverySnapshot();
    this.discoveryInFlight = request;
    void request.then(
      (snapshot) => {
        if (generation === this.generation) {
          CATALOG_DISCOVERY_OPERATION_FAMILIES.forEach((family) => {
            const result = snapshot[family];
            if (result.items) {
              const items = shuffled(result.items, this.random);
              this.sessionCollections.set(family, items);
              this.cache.setCollection(`collection:${family}`, result.items);
            } else {
              this.familyErrors.set(family, result.error);
            }
          });
          this.discoveryLoaded = true;
        }
        if (this.discoveryInFlight === request) this.discoveryInFlight = null;
      },
      () => {
        if (this.discoveryInFlight === request) this.discoveryInFlight = null;
      },
    );
    return request;
  }

  private async fetchDiscoverySnapshot(): Promise<DiscoverySnapshot> {
    const season = currentLocalSeason(this.now);
    const response = await this.execute(
      'discovery:home',
      ANILIST_COMBINED_HOME_QUERY,
      { season: season.season, seasonYear: season.year, perPage: 25 },
    );
    return Object.fromEntries(
      CATALOG_DISCOVERY_OPERATION_FAMILIES.map((family) => {
        const executionError = graphQLErrorFor(response, family);
        if (executionError) return [family, { error: executionError }];
        try {
          return [
            family,
            {
              items: mapSummaries(
                parseAniListPageAlias(response.data, family).media,
                this.mediaIdentityResolver,
              ),
            },
          ];
        } catch (error: unknown) {
          return [
            family,
            {
              error: new AniListResponseFormatError(
                error instanceof Error ? error.message : undefined,
                diagnostic(response),
              ),
            },
          ];
        }
      }),
    ) as DiscoverySnapshot;
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
      throw failure?.status === 'rejected'
        ? failure.reason
        : new AniListResponseFormatError(
            'AniList returned no discovery collections.',
          );
    }
    const pool = shuffled(deduplicate(collections.flat()), this.random);
    if (generation === this.generation) this.sessionPool = pool;
    return pool;
  }

  private fetchCollection(
    key: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<AnimeCatalogItem[]> {
    const cacheKey = `collection:${key}`;
    const cached = this.cache.getCollection(cacheKey);
    if (cached) return Promise.resolve(cached);
    const generation = this.generation;
    return this.cache.getOrCreate(cacheKey, async () => {
      const response = await this.execute(key, query, variables);
      const executionError = graphQLErrorFor(response);
      if (executionError) throw executionError;
      try {
        const items = mapSummaries(
          parseAniListPageData(response.data).media,
          this.mediaIdentityResolver,
        );
        if (generation === this.generation) {
          this.cache.setCollection(cacheKey, items);
        }
        return items;
      } catch (error: unknown) {
        if (error instanceof AniListGraphQLExecutionError) throw error;
        throw new AniListResponseFormatError(
          error instanceof Error ? error.message : undefined,
          diagnostic(response),
        );
      }
    });
  }

  private async refreshDiscoveryFamily(
    family: CatalogDiscoveryOperationFamily,
    generation: number,
  ): Promise<void> {
    const season = currentLocalSeason(this.now);
    const request =
      family === 'popular'
        ? { query: ANILIST_POPULAR_QUERY, variables: { page: 1, perPage: 25 } }
        : family === 'seasonal'
          ? {
              query: ANILIST_SEASONAL_QUERY,
              variables: {
                season: season.season,
                seasonYear: season.year,
                page: 1,
                perPage: 25,
              },
            }
          : {
              query: ANILIST_UPCOMING_QUERY,
              variables: { page: 1, perPage: 25 },
            };
    const response = await this.execute(
      `refresh:${family}`,
      request.query,
      request.variables,
    );
    const executionError = graphQLErrorFor(response);
    if (executionError) throw executionError;
    let items: AnimeCatalogItem[];
    try {
      items = mapSummaries(
        parseAniListPageData(response.data).media,
        this.mediaIdentityResolver,
      );
    } catch (error: unknown) {
      throw new AniListResponseFormatError(
        error instanceof Error ? error.message : undefined,
        diagnostic(response),
      );
    }
    if (items.length === 0) {
      throw new AniListResponseFormatError(
        `AniList returned an empty ${family} collection during refresh.`,
        diagnostic(response),
      );
    }
    if (generation !== this.generation) {
      throw new Error('The catalog cache changed while refresh was running.');
    }
    this.cache.replaceCollection(`collection:${family}`, items);
    this.sessionCollections.set(family, shuffled(items, this.random));
    this.familyErrors.delete(family);
    this.sessionPool = null;
    this.featured = null;
  }

  private execute(
    key: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<AniListClientResponse> {
    return executeAniListRequest(
      this.client,
      { key, query, variables },
      { maximumAttempts: this.maximumAttempts, sleep: this.sleep },
    );
  }

  private clearFamilyRefresh(
    family: CatalogDiscoveryOperationFamily,
    request: Promise<void>,
  ): void {
    if (this.familyRefreshes.get(family) === request) {
      this.familyRefreshes.delete(family);
    }
  }
}

export { currentLocalSeason };
