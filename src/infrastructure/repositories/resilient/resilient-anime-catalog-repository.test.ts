import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import {
  AniListGraphQLValidationError,
  AniListNetworkError,
  AniListRateLimitError,
} from '@/infrastructure/api/anilist/anilist-errors';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { CatalogItemStore } from '@/infrastructure/repositories/resilient/catalog-item-store';
import { PrimaryProviderRateLimitGate } from '@/infrastructure/repositories/resilient/primary-provider-rate-limit-gate';
import {
  ResilientAnimeCatalogRepository,
  ResilientCatalogCache,
} from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';

const primaryAnime: AnimeCatalogItem = {
  id: 21,
  title: 'Primary anime',
  alternativeTitles: [],
  synopsis: '',
  genres: ['Adventure'],
  studios: [],
  totalEpisodes: null,
  score: 8.7,
  season: 'Fall',
  year: 1999,
  airingStatus: 'Currently Airing',
  posterImageUrl: 'poster',
  largePosterImageUrl: 'large',
  heroImageUrl: 'banner',
  continuity: [],
  coverSeed: 1,
  bannerSeed: 2,
};

const fallbackAnime = { ...primaryAnime, title: 'Fallback anime' };

type CatalogMock = jest.Mocked<AnimeCatalogRepository> & {
  refreshFamily: jest.Mock<Promise<void>, [string]>;
};

function createCatalogMock(item: AnimeCatalogItem): CatalogMock {
  return {
    getFeatured: jest.fn(async () => item),
    getPopular: jest.fn(async () => [item]),
    getSeasonal: jest.fn(async () => [item]),
    getUpcoming: jest.fn(async () => [item]),
    search: jest.fn(async (_query: string) => [item]),
    getManyByIds: jest.fn(async (_ids: number[]) => [item]),
    getDetailsById: jest.fn(async (_id: number) => item),
    getKnownById: jest.fn((_id: number) => null),
    clearCache: jest.fn(),
    refreshFamily: jest.fn(async (_family: string) => undefined),
  };
}

describe('ResilientAnimeCatalogRepository', () => {
  it('uses AniList first and records provider-neutral runtime state', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(repository.getPopular()).resolves.toEqual([primaryAnime]);
    expect(fallback.getPopular).not.toHaveBeenCalled();
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      primaryProvider: 'anilist',
      primaryHealth: 'healthy',
      primaryRateLimitedUntil: null,
      operations: {
        popular: {
          circuitState: 'closed',
          lastSuccessfulSource: 'anilist',
        },
      },
    });
  });

  it('uses MAL for eligible failures and empty required collections', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    primary.getPopular
      .mockRejectedValueOnce(new AniListNetworkError())
      .mockResolvedValueOnce([]);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(repository.getPopular()).resolves.toEqual([fallbackAnime]);
    await expect(repository.getPopular()).resolves.toEqual([fallbackAnime]);
    expect(repository.getRuntimeSnapshot().operations.popular).toMatchObject({
      lastSuccessfulSource: 'mal',
      lastFallbackAt: expect.any(Number),
    });
  });

  it('does not hide programming errors behind fallback', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    const error = new AniListGraphQLValidationError('bad query');
    primary.getPopular.mockRejectedValueOnce(error);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(repository.getPopular()).rejects.toBe(error);
    expect(fallback.getPopular).not.toHaveBeenCalled();
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('soft-falls back for null primary details without damaging health', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    primary.getDetailsById.mockResolvedValueOnce(null);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(repository.getDetailsById(21)).resolves.toEqual(fallbackAnime);
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      primaryHealth: 'healthy',
      operations: { details: { circuitState: 'closed' } },
    });
  });

  it('opens only the failing family and resets primary circuits explicitly', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    primary.getPopular.mockRejectedValue(new AniListNetworkError());
    const registry = new CatalogCircuitBreakerRegistry({ failureThreshold: 2 });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      circuitRegistry: registry,
    });

    await repository.getPopular();
    await repository.getPopular();
    await expect(repository.getSeasonal()).resolves.toEqual([primaryAnime]);
    expect(repository.getCircuitState('popular')).toBe('open');
    expect(repository.getCircuitState('seasonal')).toBe('closed');
    expect(repository.getRuntimeSnapshot().primaryHealth).toBe('degraded');

    repository.resetPrimaryCircuits();
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('uses one provider-wide rate gate without opening a family circuit', async () => {
    let now = 1_000;
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    primary.getPopular.mockRejectedValueOnce(new AniListRateLimitError(2_000));
    const gate = new PrimaryProviderRateLimitGate({ now: () => now });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      rateLimitGate: gate,
      now: () => now,
    });

    await repository.getPopular();
    await repository.getSeasonal();
    expect(primary.getSeasonal).not.toHaveBeenCalled();
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      primaryHealth: 'rate_limited',
      primaryRateLimitedUntil: 3_000,
      operations: { popular: { circuitState: 'closed' } },
    });

    now = 3_001;
    await repository.getUpcoming();
    expect(primary.getUpcoming).toHaveBeenCalled();
    expect(repository.getRuntimeSnapshot().primaryHealth).toBe('healthy');
  });

  it('uses a previous valid operation cache only after both providers fail', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    const cache = new ResilientCatalogCache();
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      cache,
    });
    await repository.search('one piece');
    primary.search.mockRejectedValueOnce(new AniListNetworkError());
    fallback.search.mockRejectedValueOnce(new Error('MAL down'));

    await expect(repository.search(' one   piece ')).resolves.toEqual([
      primaryAnime,
    ]);
    expect(repository.getRuntimeSnapshot().operations.search).toMatchObject({
      lastSuccessfulSource: 'cache',
    });
  });

  it('preserves detail completeness and resolves missing IDs sequentially', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    const store = new CatalogItemStore();
    const starts: number[] = [];
    primary.getDetailsById.mockImplementation(async (id) => {
      starts.push(id);
      return { ...primaryAnime, id };
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore: store,
    });

    await expect(repository.getManyByIds([3, 2, 3, -1])).resolves.toMatchObject(
      [{ id: 3 }, { id: 2 }],
    );
    expect(starts).toEqual([3, 2]);
    await repository.getDetailsById(3);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(2);
  });

  it('refreshes discovery families independently', async () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    primary.refreshFamily.mockImplementation(async (family) => {
      if (family === 'popular') throw new AniListNetworkError();
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await repository.refresh();
    expect(primary.refreshFamily).toHaveBeenCalledTimes(3);
    expect(fallback.refreshFamily).toHaveBeenCalledTimes(1);
    expect(fallback.refreshFamily).toHaveBeenCalledWith('popular');
  });

  it('clears all provider and normalized caches without resetting health', () => {
    const primary = createCatalogMock(primaryAnime);
    const fallback = createCatalogMock(fallbackAnime);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    repository.clearCache();
    expect(primary.clearCache).toHaveBeenCalled();
    expect(fallback.clearCache).toHaveBeenCalled();
  });
});
