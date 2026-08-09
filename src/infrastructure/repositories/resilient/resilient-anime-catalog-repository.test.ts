import { CatalogUnavailableError } from '@/domain/errors/catalog-error';
import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';
import { MalNetworkError } from '@/infrastructure/api/mal/mal-errors';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import {
  JIKAN_OPERATION_FAMILIES,
  type JikanDiscoveryOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import {
  ResilientAnimeCatalogRepository,
  type ResilientCatalogRuntimeSnapshot,
} from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';

const jikanAnime: AnimeCatalogItem = {
  id: 1,
  title: 'Jikan Anime',
  alternativeTitles: [],
  synopsis: 'Jikan synopsis.',
  genres: [],
  studios: [],
  totalEpisodes: 12,
  score: 8,
  season: 'Summer',
  year: 2026,
  airingStatus: 'Currently Airing',
  posterImageUrl: null,
  largePosterImageUrl: null,
  heroImageUrl: null,
  coverSeed: 1,
  bannerSeed: 2,
};

const malAnime: AnimeCatalogItem = {
  ...jikanAnime,
  id: 2,
  title: 'MAL Anime',
};

type MockCatalogRepository = jest.Mocked<AnimeCatalogRepository>;

function createCatalogMock(item: AnimeCatalogItem): MockCatalogRepository {
  return {
    getFeatured: jest.fn(async () => item),
    getPopular: jest.fn(async () => [item]),
    getSeasonal: jest.fn(async () => [item]),
    getUpcoming: jest.fn(async () => [item]),
    search: jest.fn(async (_query: string) => [item]),
    getManyByIds: jest.fn(async (_ids: number[]) => [item]),
    getDetailsById: jest.fn(async (_id: number) => item),
    clearCache: jest.fn(),
  };
}

const OPERATIONS = [
  {
    name: 'featured',
    invoke: (repository: AnimeCatalogRepository) => repository.getFeatured(),
    call: (repository: MockCatalogRepository) => repository.getFeatured,
  },
  {
    name: 'popular',
    invoke: (repository: AnimeCatalogRepository) => repository.getPopular(),
    call: (repository: MockCatalogRepository) => repository.getPopular,
  },
  {
    name: 'seasonal',
    invoke: (repository: AnimeCatalogRepository) => repository.getSeasonal(),
    call: (repository: MockCatalogRepository) => repository.getSeasonal,
  },
  {
    name: 'upcoming',
    invoke: (repository: AnimeCatalogRepository) => repository.getUpcoming(),
    call: (repository: MockCatalogRepository) => repository.getUpcoming,
  },
  {
    name: 'search',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.search('  FRIEREN '),
    call: (repository: MockCatalogRepository) => repository.search,
  },
  {
    name: 'many',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.getManyByIds([2, 1, 2]),
    call: (repository: MockCatalogRepository) => repository.getManyByIds,
  },
  {
    name: 'details',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.getDetailsById(1),
    call: (repository: MockCatalogRepository) => repository.getDetailsById,
  },
] as const;

describe('resilient anime catalog repository', () => {
  it.each(OPERATIONS)(
    'uses Jikan for $name and never calls MAL after primary success',
    async ({ call, invoke }) => {
      const primary = createCatalogMock(jikanAnime);
      const fallback = createCatalogMock(malAnime);
      const repository = new ResilientAnimeCatalogRepository({
        primary,
        fallback,
      });
      await invoke(repository);
      expect(call(fallback)).not.toHaveBeenCalled();
    },
  );

  it.each(OPERATIONS)(
    'falls back to MAL independently for $name',
    async ({ call, invoke }) => {
      const primary = createCatalogMock(jikanAnime);
      const fallback = createCatalogMock(malAnime);
      call(primary).mockRejectedValueOnce(new JikanNetworkError());
      const repository = new ResilientAnimeCatalogRepository({
        primary,
        fallback,
      });
      await invoke(repository);
      expect(call(fallback)).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    new JikanNetworkError(),
    new JikanTimeoutError(),
    new JikanRateLimitError(null),
    new JikanServiceUnavailableError(500, null),
    new JikanServiceUnavailableError(502, null),
    new JikanServiceUnavailableError(503, null),
    new JikanServiceUnavailableError(504, null),
    new JikanResponseFormatError(),
  ])('uses MAL for an eligible Jikan %s', async (error) => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValueOnce(error);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.getPopular()).resolves.toEqual([malAnime]);
    expect(fallback.getPopular).toHaveBeenCalledTimes(1);
  });

  it('treats an unexpectedly empty required Jikan collection as fallback eligible', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockResolvedValueOnce([]);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.getPopular()).resolves.toEqual([malAnime]);
  });

  it('does not use fallback or open circuits for application errors and legitimate 404 results', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const badArgument = new JikanHttpError(400);
    primary.search.mockRejectedValueOnce(badArgument);
    primary.getDetailsById.mockResolvedValueOnce(null);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.search('valid query')).rejects.toBe(badArgument);
    await expect(repository.getDetailsById(404)).resolves.toBeNull();
    expect(fallback.search).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
    expect(repository.getCircuitState('search')).toBe('closed');
    expect(repository.getCircuitState('details')).toBe('closed');
  });

  it('does not translate a thrown Jikan not-found error into fallback data', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const notFound = new JikanNotFoundError();
    primary.getDetailsById.mockRejectedValueOnce(notFound);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.getDetailsById(404)).rejects.toBe(notFound);
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('returns the operation-correct normalized cache when both providers fail', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    await expect(repository.getSeasonal()).resolves.toEqual([jikanAnime]);
    primary.getPopular.mockRejectedValueOnce(new JikanTimeoutError());
    fallback.getPopular.mockRejectedValueOnce(new MalNetworkError());
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    expect(repository.getRuntimeSnapshot().operations.popular).toMatchObject({
      lastSuccessfulSource: 'cache',
    });
    expect(
      repository.getRuntimeSnapshot().operations.seasonal.lastSuccessfulSource,
    ).toBe('jikan');
  });

  it('throws a recoverable catalog error when both providers fail without cache', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValueOnce(new JikanTimeoutError());
    fallback.getPopular.mockRejectedValueOnce(new MalNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await expect(repository.getPopular()).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
  });

  it('does not attempt MAL when its Client ID is unavailable', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValueOnce(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      isFallbackAvailable: () => false,
    });
    await expect(repository.getPopular()).rejects.toBeInstanceOf(
      JikanNetworkError,
    );
    expect(fallback.getPopular).not.toHaveBeenCalled();
  });

  it('opens only Popular and keeps Seasonal, Upcoming, Search, and Details on Jikan', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await repository.getPopular();
    await repository.getPopular();
    await repository.getPopular();
    await repository.getSeasonal();
    await repository.getUpcoming();
    await repository.search('Naruto');
    await repository.getDetailsById(1);

    expect(primary.getPopular).toHaveBeenCalledTimes(2);
    expect(fallback.getPopular).toHaveBeenCalledTimes(3);
    expect(primary.getSeasonal).toHaveBeenCalledTimes(1);
    expect(primary.getUpcoming).toHaveBeenCalledTimes(1);
    expect(primary.search).toHaveBeenCalledTimes(1);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      jikanHealth: 'degraded',
      operations: {
        popular: {
          circuitState: 'open',
          lastSuccessfulSource: 'mal',
        },
        seasonal: {
          circuitState: 'closed',
          lastSuccessfulSource: 'jikan',
        },
        upcoming: {
          circuitState: 'closed',
          lastSuccessfulSource: 'jikan',
        },
        search: {
          circuitState: 'closed',
          lastSuccessfulSource: 'jikan',
        },
        details: {
          circuitState: 'closed',
          lastSuccessfulSource: 'jikan',
        },
      },
    });
  });

  it('keeps the composite Featured boundary isolated from Popular', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getFeatured.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getFeatured();
    await repository.getFeatured();
    await repository.getFeatured();
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    expect(primary.getFeatured).toHaveBeenCalledTimes(2);
    expect(primary.getPopular).toHaveBeenCalledTimes(1);
    expect(repository.getCircuitState('featured')).toBe('open');
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('shares Details state between getDetailsById and getManyByIds without affecting Search', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getDetailsById.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getDetailsById(1);
    await repository.getDetailsById(2);
    await repository.getManyByIds([1, 2]);
    await repository.search('healthy');
    expect(primary.getDetailsById).toHaveBeenCalledTimes(2);
    expect(primary.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getManyByIds).toHaveBeenCalledTimes(1);
    expect(primary.search).toHaveBeenCalledTimes(1);
    expect(repository.getCircuitState('details')).toBe('open');
    expect(repository.getCircuitState('search')).toBe('closed');
  });

  it('shares one Search circuit across normalized query keys', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.search.mockRejectedValue(
      new JikanServiceUnavailableError(504, null),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.search('Naruto');
    await repository.search('Bleach');
    await repository.search('One Piece');
    expect(primary.search).toHaveBeenCalledTimes(2);
    expect(fallback.search).toHaveBeenCalledTimes(3);
    expect(repository.getCircuitState('search')).toBe('open');
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('allows one half-open probe per family while concurrent calls use fallback', async () => {
    let now = 0;
    let resolveProbe: ((value: AnimeCatalogItem[]) => void) | undefined;
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular
      .mockRejectedValueOnce(new JikanNetworkError())
      .mockRejectedValueOnce(new JikanNetworkError())
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProbe = resolve;
          }),
      );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      circuitRegistry: new CatalogCircuitBreakerRegistry({
        openDurationMs: 100,
        now: () => now,
      }),
      now: () => now,
    });
    await repository.getPopular();
    await repository.getPopular();
    now = 100;
    const probe = repository.getPopular();
    const concurrent = repository.getPopular();
    await expect(concurrent).resolves.toEqual([malAnime]);
    resolveProbe?.([jikanAnime]);
    await expect(probe).resolves.toEqual([jikanAnime]);
    expect(primary.getPopular).toHaveBeenCalledTimes(3);
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('activates a provider-wide Retry-After gate without poisoning family circuits', async () => {
    let now = 1_000;
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValueOnce(new JikanRateLimitError(2_000));
    const snapshots: ResilientCatalogRuntimeSnapshot[] = [];
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      now: () => now,
      onRuntimeStatusChange: (snapshot) => snapshots.push(snapshot),
    });

    await expect(repository.getPopular()).resolves.toEqual([malAnime]);
    await expect(repository.getSeasonal()).resolves.toEqual([malAnime]);
    expect(primary.getSeasonal).not.toHaveBeenCalled();
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      jikanHealth: 'rate_limited',
      jikanRateLimitedUntil: 3_000,
      operations: {
        popular: { circuitState: 'closed' },
        seasonal: { circuitState: 'closed' },
      },
    });
    expect(snapshots.length).toBeGreaterThan(0);
    repository.clearCache();
    expect(repository.getRuntimeSnapshot().jikanHealth).toBe('rate_limited');

    now = 3_001;
    await expect(repository.getDetailsById(1)).resolves.toEqual(jikanAnime);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(repository.getRuntimeSnapshot().jikanHealth).toBe('healthy');
  });

  it('uses a bounded default gate when Retry-After is missing', async () => {
    let now = 0;
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValueOnce(new JikanRateLimitError(null));
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      now: () => now,
    });
    await repository.getPopular();
    expect(repository.getRuntimeSnapshot().jikanRateLimitedUntil).toBe(15_000);
    now = 15_001;
    await repository.getSeasonal();
    expect(primary.getSeasonal).toHaveBeenCalledTimes(1);
  });

  it('reports app-observed Jikan health as unavailable when every family is open', () => {
    const registry = new CatalogCircuitBreakerRegistry();
    JIKAN_OPERATION_FAMILIES.forEach((family) => {
      registry.get(family).recordFailure();
      registry.get(family).recordFailure();
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary: createCatalogMock(jikanAnime),
      fallback: createCatalogMock(malAnime),
      circuitRegistry: registry,
    });
    expect(repository.getRuntimeSnapshot().jikanHealth).toBe('unavailable');
  });

  it('clears data caches without resetting provider health and resets circuits explicitly', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await repository.getPopular();
    repository.clearCache();
    expect(primary.clearCache).toHaveBeenCalledTimes(1);
    expect(fallback.clearCache).toHaveBeenCalledTimes(1);
    expect(repository.getCircuitState('popular')).toBe('open');
    repository.resetCircuits('popular');
    expect(repository.getCircuitState('popular')).toBe('closed');
  });

  it('refreshes discovery families independently and falls back only for the failed family', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const primaryRefreshFamily = jest.fn(
      async (family: JikanDiscoveryOperationFamily) => {
        if (family === 'popular') {
          throw new JikanServiceUnavailableError(504, null);
        }
      },
    );
    const fallbackRefreshFamily = jest.fn(
      async (_family: JikanDiscoveryOperationFamily) => undefined,
    );
    Object.assign(primary, { refreshFamily: primaryRefreshFamily });
    Object.assign(fallback, { refreshFamily: fallbackRefreshFamily });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(repository.refresh()).resolves.toBeUndefined();
    expect(primaryRefreshFamily).toHaveBeenCalledTimes(3);
    expect(fallbackRefreshFamily).toHaveBeenCalledTimes(1);
    expect(fallbackRefreshFamily).toHaveBeenCalledWith('popular');
    expect(repository.getRuntimeSnapshot().operations).toMatchObject({
      popular: { lastSuccessfulSource: 'mal' },
      seasonal: { lastSuccessfulSource: 'jikan' },
      upcoming: { lastSuccessfulSource: 'jikan' },
    });
  });
});
