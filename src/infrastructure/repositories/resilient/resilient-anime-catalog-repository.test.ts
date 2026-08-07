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
import { CatalogCircuitBreaker } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';

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
    fallbackCall: (repository: MockCatalogRepository) => repository.getFeatured,
  },
  {
    name: 'popular',
    invoke: (repository: AnimeCatalogRepository) => repository.getPopular(),
    fallbackCall: (repository: MockCatalogRepository) => repository.getPopular,
  },
  {
    name: 'seasonal',
    invoke: (repository: AnimeCatalogRepository) => repository.getSeasonal(),
    fallbackCall: (repository: MockCatalogRepository) => repository.getSeasonal,
  },
  {
    name: 'upcoming',
    invoke: (repository: AnimeCatalogRepository) => repository.getUpcoming(),
    fallbackCall: (repository: MockCatalogRepository) => repository.getUpcoming,
  },
  {
    name: 'search',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.search('  FRIEREN '),
    fallbackCall: (repository: MockCatalogRepository) => repository.search,
  },
  {
    name: 'many',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.getManyByIds([2, 1, 2]),
    fallbackCall: (repository: MockCatalogRepository) =>
      repository.getManyByIds,
  },
  {
    name: 'details',
    invoke: (repository: AnimeCatalogRepository) =>
      repository.getDetailsById(1),
    fallbackCall: (repository: MockCatalogRepository) =>
      repository.getDetailsById,
  },
] as const;

describe('resilient anime catalog repository', () => {
  it.each(OPERATIONS)(
    'uses Jikan for $name and never calls MAL after primary success',
    async ({ fallbackCall, invoke }) => {
      const primary = createCatalogMock(jikanAnime);
      const fallback = createCatalogMock(malAnime);
      const sourceUsed = jest.fn();
      const repository = new ResilientAnimeCatalogRepository({
        primary,
        fallback,
        onSourceUsed: sourceUsed,
      });
      await invoke(repository);
      expect(fallbackCall(fallback)).not.toHaveBeenCalled();
      expect(sourceUsed).toHaveBeenLastCalledWith('jikan');
    },
  );

  it.each(OPERATIONS)(
    'falls back to MAL independently for $name',
    async ({ fallbackCall, invoke }) => {
      const primary = createCatalogMock(jikanAnime);
      const fallback = createCatalogMock(malAnime);
      const sourceUsed = jest.fn();
      const primaryCall = fallbackCall(primary);
      primaryCall.mockRejectedValueOnce(new JikanNetworkError());
      const repository = new ResilientAnimeCatalogRepository({
        primary,
        fallback,
        onSourceUsed: sourceUsed,
      });
      await invoke(repository);
      expect(fallbackCall(fallback)).toHaveBeenCalledTimes(1);
      expect(sourceUsed).toHaveBeenLastCalledWith('mal');
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

  it('does not use fallback or open the circuit for application and legitimate 404 cases', async () => {
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
    expect(repository.getCircuitState()).toBe('closed');
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
    expect(repository.getCircuitState()).toBe('closed');
  });

  it('returns previous normalized cache when both live providers fail', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    const sources: string[] = [];
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      onSourceUsed: (source) => sources.push(source),
    });
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    primary.getPopular.mockRejectedValueOnce(new JikanTimeoutError());
    fallback.getPopular.mockRejectedValueOnce(new MalNetworkError());
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    expect(sources).toEqual(['jikan', 'cache']);
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

  it('opens after two failures, skips Jikan, and uses MAL while open', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await repository.getPopular();
    expect(repository.getCircuitState()).toBe('open');
    await repository.getPopular();
    expect(primary.getPopular).toHaveBeenCalledTimes(2);
    expect(fallback.getPopular).toHaveBeenCalledTimes(3);
  });

  it('resets consecutive Jikan failures after a successful request', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular
      .mockRejectedValueOnce(new JikanNetworkError())
      .mockResolvedValueOnce([jikanAnime])
      .mockRejectedValueOnce(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await repository.getPopular();
    await repository.getPopular();
    expect(repository.getCircuitState()).toBe('closed');
  });

  it('allows one half-open Jikan probe and closes after it succeeds', async () => {
    let now = 0;
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular
      .mockRejectedValueOnce(new JikanNetworkError())
      .mockRejectedValueOnce(new JikanNetworkError())
      .mockResolvedValueOnce([jikanAnime]);
    const breaker = new CatalogCircuitBreaker({
      openDurationMs: 100,
      now: () => now,
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      circuitBreaker: breaker,
    });
    await repository.getPopular();
    await repository.getPopular();
    now = 100;
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
    expect(repository.getCircuitState()).toBe('closed');
  });

  it('clears both provider caches, stale cache, and circuit state', async () => {
    const primary = createCatalogMock(jikanAnime);
    const fallback = createCatalogMock(malAnime);
    primary.getPopular.mockRejectedValue(new JikanNetworkError());
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await repository.getPopular();
    expect(repository.getCircuitState()).toBe('open');
    repository.clearCache();
    expect(primary.clearCache).toHaveBeenCalledTimes(1);
    expect(fallback.clearCache).toHaveBeenCalledTimes(1);
    expect(repository.getCircuitState()).toBe('closed');
  });

  it('falls back independently during a manual catalog refresh', async () => {
    const primary = Object.assign(createCatalogMock(jikanAnime), {
      refresh: jest.fn(async () => {
        throw new JikanServiceUnavailableError(504, null);
      }),
    });
    const fallback = Object.assign(createCatalogMock(malAnime), {
      refresh: jest.fn(async () => undefined),
    });
    const sourceUsed = jest.fn();
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
      onSourceUsed: sourceUsed,
    });
    await expect(repository.refresh()).resolves.toBeUndefined();
    expect(primary.refresh).toHaveBeenCalledTimes(1);
    expect(fallback.refresh).toHaveBeenCalledTimes(1);
    expect(sourceUsed).toHaveBeenLastCalledWith('mal');
  });

  it('preserves stale normalized data when a manual refresh and both later providers fail', async () => {
    const primary = Object.assign(createCatalogMock(jikanAnime), {
      refresh: jest.fn(async () => {
        throw new JikanNetworkError();
      }),
    });
    const fallback = Object.assign(createCatalogMock(malAnime), {
      refresh: jest.fn(async () => {
        throw new MalNetworkError();
      }),
    });
    const repository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await repository.getPopular();
    await expect(repository.refresh()).rejects.toBeInstanceOf(
      CatalogUnavailableError,
    );
    primary.getPopular.mockRejectedValueOnce(new JikanNetworkError());
    fallback.getPopular.mockRejectedValueOnce(new MalNetworkError());
    await expect(repository.getPopular()).resolves.toEqual([jikanAnime]);
  });
});
