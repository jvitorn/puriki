import { CatalogUnavailableError } from '@/domain/errors/catalog-error';
import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { JikanClientPort } from '@/infrastructure/api/jikan/jikan-client';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import { MalNetworkError } from '@/infrastructure/api/mal/mal-errors';
import { JikanAnimeCatalogRepository } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { CatalogItemStore } from '@/infrastructure/repositories/resilient/catalog-item-store';
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

function animeWithId(
  item: AnimeCatalogItem,
  id: number,
  title = `${item.title} ${id}`,
): AnimeCatalogItem {
  return { ...item, id, title, coverSeed: id, bannerSeed: id + 1 };
}

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

  it('returns 25 collection-known IDs with zero detail-provider calls', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const known = Array.from({ length: 25 }, (_, index) =>
      animeWithId(jikanAnime, index + 1),
    );
    primary.getSeasonal.mockResolvedValueOnce(known);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await repository.getSeasonal();
    const requested = [
      3,
      1,
      2,
      ...Array.from({ length: 22 }, (_, index) => index + 4),
    ];
    await expect(repository.getManyByIds(requested)).resolves.toMatchObject(
      requested.map((id) => ({ id })),
    );
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
    expect(primary.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getManyByIds).not.toHaveBeenCalled();
  });

  it('promotes a search summary on the first explicit detail request and reuses it', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    const summary = animeWithId(jikanAnime, 7, 'Search summary');
    const details = animeWithId(jikanAnime, 7, 'Full details');
    primary.search.mockResolvedValueOnce([summary]);
    primary.getDetailsById.mockResolvedValue(details);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });

    await expect(repository.search('anime')).resolves.toEqual([summary]);
    expect(itemStore.get(7)).toMatchObject({
      source: 'jikan',
      completeness: 'summary',
    });
    await expect(repository.getDetailsById(7)).resolves.toEqual(details);
    expect(itemStore.get(7)).toMatchObject({
      item: { title: 'Full details' },
      source: 'jikan',
      completeness: 'details',
    });
    await expect(repository.getDetailsById(7)).resolves.toEqual(details);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('accepts mixed known summaries and details in getManyByIds without provider work', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    itemStore.upsert(animeWithId(jikanAnime, 1, 'Known summary'), {
      source: 'jikan',
      completeness: 'summary',
    });
    itemStore.upsert(animeWithId(malAnime, 2, 'Known details'), {
      source: 'mal',
      completeness: 'details',
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });

    await expect(repository.getManyByIds([2, 1, 2])).resolves.toMatchObject([
      { id: 2, title: 'Known details' },
      { id: 1, title: 'Known summary' },
    ]);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('promotes a Jikan summary with MAL details and never downgrades it later', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    const summary = animeWithId(jikanAnime, 5, 'Jikan summary');
    const details = animeWithId(malAnime, 5, 'MAL details');
    primary.search.mockResolvedValueOnce([summary]);
    primary.getDetailsById.mockRejectedValueOnce(new JikanNetworkError());
    fallback.getDetailsById.mockResolvedValueOnce(details);
    primary.getPopular.mockResolvedValueOnce([
      animeWithId(jikanAnime, 5, 'Later Jikan summary'),
    ]);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });

    await repository.search('anime');
    await expect(repository.getDetailsById(5)).resolves.toEqual(details);
    await repository.getPopular();
    expect(itemStore.get(5)).toMatchObject({
      item: { title: 'MAL details' },
      source: 'mal',
      completeness: 'details',
    });
    await repository.getDetailsById(5);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(fallback.getDetailsById).toHaveBeenCalledTimes(1);
  });

  it('allows Jikan details to recover a MAL summary', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    const fallbackSummary = animeWithId(malAnime, 9, 'MAL summary');
    const primaryDetails = animeWithId(jikanAnime, 9, 'Jikan details');
    primary.search.mockRejectedValueOnce(new JikanNetworkError());
    fallback.search.mockResolvedValueOnce([fallbackSummary]);
    primary.getDetailsById.mockResolvedValueOnce(primaryDetails);
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });

    await repository.search('anime');
    expect(itemStore.get(9)).toMatchObject({
      source: 'mal',
      completeness: 'summary',
    });
    await expect(repository.getDetailsById(9)).resolves.toEqual(primaryDetails);
    expect(itemStore.get(9)).toMatchObject({
      source: 'jikan',
      completeness: 'details',
    });
  });

  it('resolves only two unknown IDs when 23 of 25 are already known', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const known = Array.from({ length: 23 }, (_, index) =>
      animeWithId(jikanAnime, index + 1),
    );
    primary.getPopular.mockResolvedValueOnce(known);
    primary.getDetailsById.mockImplementation(async (id) =>
      animeWithId(jikanAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await repository.getPopular();
    await expect(
      repository.getManyByIds(
        Array.from({ length: 25 }, (_, index) => index + 1),
      ),
    ).resolves.toHaveLength(25);
    expect(primary.getDetailsById.mock.calls.map(([id]) => id)).toEqual([
      24, 25,
    ]);
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('bounds a 25-ID failing Jikan batch to early failures and configured retries', async () => {
    const maximumAttempts = 2;
    const failureThreshold = 2;
    const jikanRequests = jest.fn(async () => {
      throw new JikanServiceUnavailableError(504, null);
    });
    const client: JikanClientPort = {
      anime: {
        getAnimeFullById: jikanRequests,
        getAnimeSearch: jest.fn(),
      },
      seasons: {
        getSeasonNow: jest.fn(),
        getSeasonUpcoming: jest.fn(),
      },
      top: { getTopAnime: jest.fn() },
    };
    const primary = new JikanAnimeCatalogRepository({
      client,
      maximumAttempts,
      scheduler: new JikanRequestScheduler({ requestIntervalMs: 0 }),
      sleep: async () => undefined,
    });
    const fallback = createCatalogMock(malAnime);
    fallback.getDetailsById.mockImplementation(async (id) =>
      animeWithId(malAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      circuitRegistry: new CatalogCircuitBreakerRegistry({ failureThreshold }),
    });
    const ids = Array.from({ length: 25 }, (_, index) => index + 1);

    await expect(repository.getManyByIds(ids)).resolves.toHaveLength(25);
    expect(jikanRequests).toHaveBeenCalledTimes(
      maximumAttempts * failureThreshold,
    );
    expect(fallback.getDetailsById).toHaveBeenCalledTimes(25);
    expect(fallback.getManyByIds).not.toHaveBeenCalled();
    expect(repository.getCircuitState('details')).toBe('open');
  });

  it('stops all future Jikan item work after an early 429', async () => {
    let now = 0;
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getDetailsById.mockRejectedValue(new JikanRateLimitError(5_000));
    fallback.getDetailsById.mockImplementation(async (id) =>
      animeWithId(malAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      now: () => now,
    });
    const ids = Array.from({ length: 25 }, (_, index) => index + 1);

    await expect(repository.getManyByIds(ids)).resolves.toHaveLength(25);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(fallback.getDetailsById).toHaveBeenCalledTimes(25);
    expect(repository.getRuntimeSnapshot()).toMatchObject({
      jikanHealth: 'rate_limited',
      jikanRateLimitedUntil: 5_000,
      operations: { details: { circuitState: 'closed' } },
    });
    now = 5_001;
  });

  it('preserves requested order, filters invalid IDs, deduplicates, and omits 404s', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getDetailsById.mockImplementation(async (id) =>
      id === 2 ? null : animeWithId(jikanAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });

    await expect(
      repository.getManyByIds([3, -1, 1, 3, 2, 0, 1.5]),
    ).resolves.toMatchObject([{ id: 3 }, { id: 1 }]);
    expect(primary.getDetailsById.mock.calls.map(([id]) => id)).toEqual([
      3, 1, 2,
    ]);
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('does not start the next resilient item before the current one resolves', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    let resolveFirst: (value: AnimeCatalogItem) => void = () => undefined;
    primary.getDetailsById
      .mockImplementationOnce(
        (id) =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementation(async (id) => animeWithId(jikanAnime, id));
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    const batch = repository.getManyByIds([1, 2, 3]);
    await Promise.resolve();
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    resolveFirst(animeWithId(jikanAnime, 1));
    await expect(batch).resolves.toHaveLength(3);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(3);
  });

  it('repopulates the item store from an operation-cache result', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });
    await repository.getPopular();
    itemStore.clear();
    primary.getPopular.mockRejectedValueOnce(new JikanTimeoutError());
    fallback.getPopular.mockRejectedValueOnce(new MalNetworkError());
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    expect(itemStore.get(1)).toMatchObject({
      source: 'cache',
      completeness: 'summary',
    });
    primary.getDetailsById.mockClear();
    fallback.getDetailsById.mockClear();

    await expect(repository.getManyByIds([1])).resolves.toMatchObject([
      { id: 1 },
    ]);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
  });

  it('repopulates cleared normalized state from a details operation cache as details', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
    });
    await repository.getDetailsById(1);
    itemStore.clear();
    primary.getDetailsById.mockRejectedValueOnce(new JikanTimeoutError());
    fallback.getDetailsById.mockRejectedValueOnce(new MalNetworkError());

    await expect(repository.getDetailsById(1)).resolves.toEqual(jikanAnime);
    expect(itemStore.get(1)).toMatchObject({
      source: 'cache',
      completeness: 'details',
    });
  });

  it('returns sufficient stored items without touching an open Details circuit', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const itemStore = new CatalogItemStore();
    itemStore.upsert(animeWithId(jikanAnime, 1, 'Stored details'), {
      source: 'jikan',
      completeness: 'details',
    });
    itemStore.upsert(animeWithId(malAnime, 2, 'Stored summary'), {
      source: 'mal',
      completeness: 'summary',
    });
    const circuitRegistry = new CatalogCircuitBreakerRegistry();
    circuitRegistry.get('details').recordFailure();
    circuitRegistry.get('details').recordFailure();
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      itemStore,
      circuitRegistry,
    });

    await expect(repository.getDetailsById(1)).resolves.toMatchObject({
      title: 'Stored details',
    });
    await expect(repository.getManyByIds([2, 1])).resolves.toHaveLength(2);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
    expect(repository.getCircuitState('details')).toBe('open');
  });

  it('logs one compact development summary for batch resolution', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const info = jest.spyOn(console, 'info').mockImplementation();
    process.env.NODE_ENV = 'development';
    try {
      const primary = createCatalogMock(jikanAnime);
      const fallback = createCatalogMock(malAnime);
      primary.getPopular.mockResolvedValueOnce([
        animeWithId(jikanAnime, 1),
        animeWithId(jikanAnime, 2),
      ]);
      primary.getDetailsById.mockResolvedValueOnce(
        animeWithId(jikanAnime, 2, 'Full details'),
      );
      const repository = new ResilientAnimeCatalogRepository({
        primary,
        fallback,
      });
      await repository.getPopular();
      await repository.getDetailsById(2);
      info.mockClear();

      await repository.getManyByIds([2, 1, 2]);
      expect(info).toHaveBeenCalledTimes(1);
      expect(info).toHaveBeenCalledWith('[Catalog] getManyByIds completed', {
        requested: 2,
        summaryHits: 1,
        detailHits: 1,
        networkMissing: 0,
        detailResolutions: 0,
        jikanSkippedAfterCircuit: false,
        jikanSkippedAfterRateLimit: false,
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      info.mockRestore();
    }
  });

  it('shares Details state between getDetailsById and getManyByIds without affecting Search', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getDetailsById.mockRejectedValue(new JikanNetworkError());
    fallback.getDetailsById.mockImplementation(async (id) =>
      animeWithId(malAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getDetailsById(1);
    await repository.getDetailsById(2);
    await repository.getManyByIds([1, 2, 3]);
    await repository.search('healthy');
    expect(primary.getDetailsById).toHaveBeenCalledTimes(2);
    expect(primary.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).toHaveBeenCalledTimes(3);
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

  it('clears normalized items together with operation and provider data caches', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getDetailsById.mockImplementation(async (id) =>
      animeWithId(jikanAnime, id),
    );
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await repository.getManyByIds([1]);
    expect(primary.getDetailsById).not.toHaveBeenCalled();

    repository.clearCache();
    await repository.getPopular();
    expect(primary.getPopular).toHaveBeenCalledTimes(2);

    repository.clearCache();
    await repository.getManyByIds([1]);
    expect(primary.getDetailsById).toHaveBeenCalledTimes(1);
    expect(primary.clearCache).toHaveBeenCalledTimes(2);
    expect(fallback.clearCache).toHaveBeenCalledTimes(2);
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
