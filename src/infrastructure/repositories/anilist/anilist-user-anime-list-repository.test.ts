import type {
  AniListClientPort,
  AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import { AniListUnauthorizedError } from '@/infrastructure/api/anilist/anilist-errors';
import { AniListUserAnimeListRepository } from '@/infrastructure/repositories/anilist/anilist-user-anime-list-repository';

const RATE_LIMIT = {
  limit: 90,
  remaining: 89,
  retryAfterSeconds: null,
  resetAt: null,
};

function collection(
  entries: unknown[],
  hasNextChunk = false,
): AniListClientResponse {
  return {
    data: {
      MediaListCollection: {
        hasNextChunk,
        lists: [{ entries }],
      },
    },
    errors: [],
    status: 200,
    elapsedMs: 10,
    rateLimit: RATE_LIMIT,
  };
}

function entry(options: {
  mediaId: number;
  idMal: number | null;
  status?: string;
  score?: number | null;
  progress?: number | null;
  updatedAt?: number;
}) {
  return {
    mediaId: options.mediaId,
    status: options.status ?? 'CURRENT',
    score: 'score' in options ? options.score! : 8,
    progress: 'progress' in options ? options.progress! : 3,
    updatedAt: options.updatedAt ?? 1_700_000_000,
    media: { idMal: options.idMal },
  };
}

function createClient(
  responses: AniListClientResponse[],
): jest.Mocked<AniListClientPort> {
  return {
    execute: jest.fn(
      async (_request: Parameters<AniListClientPort['execute']>[0]) => {
        const response = responses.shift();
        if (!response) throw new Error('Missing test response.');
        return response;
      },
    ),
  };
}

describe('AniListUserAnimeListRepository', () => {
  it('loads every chunk, deduplicates by provider and MAL IDs, and paginates locally', async () => {
    const client = createClient([
      collection(
        [
          entry({ mediaId: 1, idMal: 11, updatedAt: 1_700_000_000 }),
          entry({ mediaId: 2, idMal: null }),
          entry({ mediaId: 3, idMal: 33, updatedAt: 1_700_000_100 }),
        ],
        true,
      ),
      collection([
        entry({
          mediaId: 1,
          idMal: 11,
          status: 'COMPLETED',
          progress: 12,
          updatedAt: 1_700_000_200,
        }),
        entry({ mediaId: 4, idMal: 33, updatedAt: 1_700_000_050 }),
        entry({ mediaId: 5, idMal: 55, updatedAt: 1_700_000_150 }),
      ]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
    });

    await expect(
      repository.getPage({ page: 1, pageSize: 2 }),
    ).resolves.toMatchObject({
      items: [
        { animeId: 11, status: 'completed', watchedEpisodes: 12 },
        { animeId: 55 },
      ],
      page: 1,
      nextPage: 2,
      totalCount: 3,
    });
    await expect(
      repository.getPage({ page: 2, pageSize: 2 }),
    ).resolves.toMatchObject({ items: [{ animeId: 33 }], nextPage: null });
    await expect(
      repository.getPage({ page: 1, pageSize: 10, status: 'completed' }),
    ).resolves.toMatchObject({ items: [{ animeId: 11 }], totalCount: 1 });
    await expect(repository.getByAnimeId(55)).resolves.toMatchObject({
      animeId: 55,
    });
    expect(client.execute).toHaveBeenCalledTimes(2);
    expect(client.execute.mock.calls[0]?.[0]).toMatchObject({
      variables: { userId: 99, chunk: 1, perChunk: 500 },
    });
    expect(client.execute.mock.calls[1]?.[0]).toMatchObject({
      variables: { userId: 99, chunk: 2, perChunk: 500 },
    });
  });

  it('coalesces concurrent reads and refreshes after TTL or explicit invalidation', async () => {
    let now = 1_000;
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      collection([entry({ mediaId: 1, idMal: 11, progress: 4 })]),
      collection([entry({ mediaId: 1, idMal: 11, progress: 5 })]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      now: () => now,
      cacheTtlMs: 30_000,
      maximumAttempts: 1,
    });

    await Promise.all([
      repository.getPage({ page: 1, pageSize: 10 }),
      repository.getByAnimeId(11),
    ]);
    expect(client.execute).toHaveBeenCalledTimes(1);

    now += 30_001;
    await repository.getByAnimeId(11);
    expect(client.execute).toHaveBeenCalledTimes(2);

    repository.invalidateCache();
    await repository.getByAnimeId(11);
    expect(client.execute).toHaveBeenCalledTimes(3);
  });

  it('starts a fresh snapshot when invalidated during an in-flight read', async () => {
    let resolveFirst: ((response: AniListClientResponse) => void) | undefined;
    const execute = jest
      .fn()
      .mockImplementationOnce(
        (_request: Parameters<AniListClientPort['execute']>[0]) =>
          new Promise<AniListClientResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        collection([entry({ mediaId: 1, idMal: 11, progress: 9 })]),
      );
    const repository = new AniListUserAnimeListRepository({
      client: { execute },
      userId: 99,
      maximumAttempts: 1,
    });

    const staleRead = repository.getByAnimeId(11);
    await Promise.resolve();
    expect(execute).toHaveBeenCalledTimes(1);
    repository.invalidateCache();
    await expect(repository.getByAnimeId(11)).resolves.toMatchObject({
      watchedEpisodes: 9,
    });
    expect(execute).toHaveBeenCalledTimes(2);

    resolveFirst?.(collection([entry({ mediaId: 1, idMal: 11, progress: 1 })]));
    await expect(staleRead).resolves.toMatchObject({ watchedEpisodes: 1 });
    await expect(repository.getByAnimeId(11)).resolves.toMatchObject({
      watchedEpisodes: 9,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('marks the session for reconnection after an unauthorized response', async () => {
    const client: jest.Mocked<AniListClientPort> = {
      execute: jest.fn(
        async (_request: Parameters<AniListClientPort['execute']>[0]) => {
          throw new AniListUnauthorizedError();
        },
      ),
    };
    const onUnauthorized = jest.fn(async () => undefined);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      onUnauthorized,
      maximumAttempts: 1,
    });

    await expect(
      repository.getPage({ page: 1, pageSize: 10 }),
    ).rejects.toBeInstanceOf(AniListUnauthorizedError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('rejects every mutation explicitly in read-only mode', async () => {
    const repository = new AniListUserAnimeListRepository({
      client: createClient([]),
      userId: 99,
    });
    await expect(repository.addToList(1)).rejects.toThrow('read-only');
    await expect(repository.removeFromList(1)).rejects.toThrow('read-only');
    await expect(repository.updateProgress(1, 2)).rejects.toThrow('read-only');
    await expect(repository.updateStatus(1, 'completed')).rejects.toThrow(
      'read-only',
    );
    await expect(repository.updateScore(1, 8)).rejects.toThrow('read-only');
  });
});
