import type {
  AniListClientPort,
  AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import { AniListGraphQLExecutionError } from '@/infrastructure/api/anilist/anilist-errors';
import {
  ANILIST_COMBINED_HOME_QUERY,
  ANILIST_DETAILS_QUERY,
  ANILIST_POPULAR_QUERY,
  ANILIST_SEARCH_QUERY,
} from '@/infrastructure/api/anilist/anilist-queries';
import {
  anilistDetailsPayload,
  anilistPage,
  anilistSummary,
} from '@/infrastructure/api/anilist/anilist-test-fixtures';
import { AniListAnimeCatalogRepository } from '@/infrastructure/repositories/anilist/anilist-anime-catalog-repository';

function response(
  data: unknown,
  errors: AniListClientResponse['errors'] = [],
): AniListClientResponse {
  return {
    data,
    errors,
    status: 200,
    elapsedMs: 10,
    rateLimit: {
      limit: 30,
      remaining: 29,
      retryAfterSeconds: null,
      resetAt: null,
    },
  };
}

function combinedData() {
  return {
    popular: {
      media: [
        anilistSummary({ id: 1, idMal: 21 }),
        anilistSummary({ id: 2, idMal: null }),
      ],
    },
    seasonal: { media: [anilistSummary({ id: 3, idMal: 20 })] },
    upcoming: { media: [anilistSummary({ id: 4, idMal: 52_991 })] },
  };
}

function createClient(execute: jest.Mock): AniListClientPort {
  return { execute: execute as AniListClientPort['execute'] };
}

describe('AniListAnimeCatalogRepository', () => {
  it('coalesces cold concurrent Home discovery into one GraphQL request', async () => {
    const execute = jest.fn(async (_request: unknown) =>
      response(combinedData()),
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
      random: () => 0.5,
      now: () => new Date('2026-12-10T12:00:00').getTime(),
    });

    const [popular, seasonal, upcoming] = await Promise.all([
      repository.getPopular(),
      repository.getSeasonal(),
      repository.getUpcoming(),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      query: ANILIST_COMBINED_HOME_QUERY,
      variables: { season: 'WINTER', seasonYear: 2026, perPage: 25 },
    });
    expect(popular).toHaveLength(1);
    expect(seasonal[0]?.id).toBe(20);
    expect(upcoming[0]?.id).toBe(52_991);
  });

  it('keeps usable aliases when another family has a GraphQL error', async () => {
    const data = { ...combinedData(), upcoming: null };
    const execute = jest.fn(async (_request: unknown) =>
      response(data, [
        { message: 'Upcoming resolver failed', path: ['upcoming', 'media'] },
      ]),
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });

    await expect(repository.getPopular()).resolves.toHaveLength(1);
    await expect(repository.getSeasonal()).resolves.toHaveLength(1);
    await expect(repository.getUpcoming()).rejects.toBeInstanceOf(
      AniListGraphQLExecutionError,
    );
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('derives Featured from the shared discovery pool without another request', async () => {
    const execute = jest.fn(async (_request: unknown) =>
      response(combinedData()),
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
      random: () => 0,
    });
    await repository.getPopular();
    await expect(repository.getFeatured()).resolves.toMatchObject({
      id: expect.any(Number),
      heroImageUrl: expect.any(String),
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('normalizes search, requests 25 summaries and filters missing MAL IDs', async () => {
    const execute = jest.fn(async (_request: unknown) =>
      response(
        anilistPage([
          anilistSummary({ idMal: 21 }),
          anilistSummary({ id: 2, idMal: null }),
        ]),
      ),
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });

    await expect(repository.search('  One   Piece ')).resolves.toMatchObject([
      { id: 21 },
    ]);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      query: ANILIST_SEARCH_QUERY,
      variables: { search: 'one piece', page: 1, perPage: 25 },
    });
  });

  it('caches details and treats null Media as a soft miss', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce(
        response({ Media: anilistDetailsPayload({ idMal: 21 }) }),
      )
      .mockResolvedValueOnce(response({ Media: null }));
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });

    await expect(repository.getDetailsById(21)).resolves.toMatchObject({
      id: 21,
      synopsis: 'A pirate adventure.',
    });
    await repository.getDetailsById(21);
    await expect(repository.getDetailsById(999)).resolves.toBeNull();
    await expect(repository.getDetailsById(999)).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      query: ANILIST_DETAILS_QUERY,
      variables: { idMal: 21 },
    });
  });

  it('resolves missing IDs sequentially and preserves first-seen order', async () => {
    let active = 0;
    let maximumActive = 0;
    const execute = jest.fn(
      async (request: { variables?: Record<string, unknown> }) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const idMal = Number(request.variables?.idMal);
        await Promise.resolve();
        active -= 1;
        return response({ Media: anilistDetailsPayload({ idMal }) });
      },
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });
    await expect(repository.getManyByIds([3, 2, 3, 0])).resolves.toMatchObject([
      { id: 3 },
      { id: 2 },
    ]);
    expect(maximumActive).toBe(1);
  });

  it('refreshes one family with its individual query', async () => {
    const execute = jest
      .fn()
      .mockResolvedValue(response(anilistPage([anilistSummary()])));
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });
    await repository.refreshFamily('popular');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      query: ANILIST_POPULAR_QUERY,
      variables: { page: 1, perPage: 25 },
    });
  });

  it('clears all session caches', async () => {
    const execute = jest.fn(async (_request: unknown) =>
      response(combinedData()),
    );
    const repository = new AniListAnimeCatalogRepository({
      client: createClient(execute),
    });
    await repository.getPopular();
    repository.clearCache();
    await repository.getPopular();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
