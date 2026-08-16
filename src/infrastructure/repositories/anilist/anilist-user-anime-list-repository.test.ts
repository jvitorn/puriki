import { DomainError } from '@/domain/errors/domain-error';
import type {
  AniListClientPort,
  AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListGraphQLExecutionError,
  AniListNetworkError,
  AniListUnauthorizedError,
} from '@/infrastructure/api/anilist/anilist-errors';
import type {
  AniListMediaIdentity,
  AniListMediaIdentityResolver,
} from '@/infrastructure/api/anilist/anilist-media-identity';
import {
  ANILIST_DELETE_USER_LIST_ENTRY_MUTATION,
  ANILIST_SAVE_USER_LIST_ENTRY_MUTATION,
} from '@/infrastructure/api/anilist/anilist-queries';
import { AniListUserAnimeListRepository } from '@/infrastructure/repositories/anilist/anilist-user-anime-list-repository';

const RATE_LIMIT = {
  limit: 90,
  remaining: 89,
  retryAfterSeconds: null,
  resetAt: null,
};

function response(data: unknown, errors: AniListClientResponse['errors'] = []) {
  return {
    data,
    errors,
    status: 200,
    elapsedMs: 10,
    rateLimit: RATE_LIMIT,
  } satisfies AniListClientResponse;
}

function collection(
  entries: unknown[],
  hasNextChunk = false,
): AniListClientResponse {
  return response({
    MediaListCollection: {
      hasNextChunk,
      lists: [{ entries }],
    },
  });
}

function entry(options: {
  mediaId: number;
  idMal: number | null;
  listEntryId?: number;
  status?: string;
  score?: number | null;
  progress?: number | null;
  updatedAt?: number;
  totalEpisodes?: number | null;
  mediaStatus?: string | null;
}) {
  return {
    id: options.listEntryId ?? options.mediaId + 1_000,
    mediaId: options.mediaId,
    status: options.status ?? 'CURRENT',
    score: 'score' in options ? options.score! : 8,
    progress: 'progress' in options ? options.progress! : 3,
    updatedAt: options.updatedAt ?? 1_700_000_000,
    media: {
      idMal: options.idMal,
      episodes:
        'totalEpisodes' in options ? options.totalEpisodes! : (12 as number),
      status:
        'mediaStatus' in options
          ? options.mediaStatus!
          : ('FINISHED' as string),
    },
  };
}

function saved(options: Parameters<typeof entry>[0]): AniListClientResponse {
  return response({ SaveMediaListEntry: entry(options) });
}

function deleted(value: boolean): AniListClientResponse {
  return response({ DeleteMediaListEntry: { deleted: value } });
}

function createClient(
  responses: (AniListClientResponse | Error)[],
): jest.Mocked<AniListClientPort> {
  return {
    execute: jest.fn(
      async (_request: Parameters<AniListClientPort['execute']>[0]) => {
        const next = responses.shift();
        if (!next) throw new Error('Missing test response.');
        if (next instanceof Error) throw next;
        return next;
      },
    ),
  };
}

function identityResolver(
  identities: Record<number, AniListMediaIdentity> = {},
): jest.Mocked<AniListMediaIdentityResolver> {
  return {
    resolve: jest.fn(async (animeId) => identities[animeId] ?? null),
    remember: jest.fn(),
    clear: jest.fn(),
  };
}

describe('AniListUserAnimeListRepository', () => {
  it('loads every chunk, preserves remote IDs, deduplicates, and paginates locally', async () => {
    const identities = identityResolver();
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
          listEntryId: 2_001,
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
      mediaIdentityResolver: identities,
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
    expect(identities.remember).toHaveBeenCalledWith({
      animeId: 11,
      mediaId: 1,
      totalEpisodes: 12,
      airingStatus: 'finished',
    });
    expect(client.execute).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent reads and refreshes after TTL or invalidation', async () => {
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
      mediaIdentityResolver: identityResolver(),
    });

    await Promise.all([
      repository.getPage({ page: 1, pageSize: 10 }),
      repository.getByAnimeId(11),
    ]);
    expect(client.execute).toHaveBeenCalledTimes(1);
    now += 30_001;
    await repository.getByAnimeId(11);
    repository.invalidateCache();
    await repository.getByAnimeId(11);
    expect(client.execute).toHaveBeenCalledTimes(3);
  });

  it('creates a default PLANNING entry through the MAL-to-AniList identity', async () => {
    const identities = identityResolver({
      22: {
        animeId: 22,
        mediaId: 202,
        totalEpisodes: 12,
        airingStatus: 'finished',
      },
    });
    const client = createClient([
      collection([]),
      saved({
        listEntryId: 700,
        mediaId: 202,
        idMal: 22,
        status: 'PLANNING',
        score: 0,
        progress: 0,
        updatedAt: 1_700_000_100,
      }),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identities,
    });

    await expect(repository.addToList(22)).resolves.toMatchObject({
      animeId: 22,
      status: 'plan_to_watch',
      watchedEpisodes: 0,
      userScore: null,
    });
    expect(identities.resolve).toHaveBeenCalledWith(22);
    expect(client.execute.mock.calls[1]?.[0]).toMatchObject({
      query: ANILIST_SAVE_USER_LIST_ENTRY_MUTATION,
      variables: { mediaId: 202, status: 'PLANNING' },
    });
    await expect(repository.getByAnimeId(22)).resolves.toMatchObject({
      status: 'plan_to_watch',
    });
    expect(client.execute).toHaveBeenCalledTimes(2);
  });

  it('creates an explicit completed entry with final progress', async () => {
    const client = createClient([
      collection([]),
      saved({
        listEntryId: 700,
        mediaId: 202,
        idMal: 22,
        status: 'COMPLETED',
        progress: 12,
      }),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver({
        22: {
          animeId: 22,
          mediaId: 202,
          totalEpisodes: 12,
          airingStatus: 'finished',
        },
      }),
    });

    await repository.addToList(22, 'completed');
    expect(client.execute.mock.calls[1]?.[0].variables).toEqual({
      mediaId: 202,
      status: 'COMPLETED',
      progress: 12,
    });
  });

  it('does not resolve or save an entry already present in the snapshot', async () => {
    const identities = identityResolver();
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identities,
    });

    await repository.addToList(11);
    await repository.addToList(11, 'completed');
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(identities.resolve).not.toHaveBeenCalled();
  });

  it('normalizes progress and sends status only for auto-complete', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11, progress: 3 })]),
      saved({ mediaId: 1, idMal: 11, progress: 4, updatedAt: 1_700_000_100 }),
      saved({
        mediaId: 1,
        idMal: 11,
        progress: 12,
        status: 'COMPLETED',
        updatedAt: 1_700_000_200,
      }),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await repository.updateProgress(11, 4.9);
    await expect(repository.updateProgress(11, 99)).resolves.toMatchObject({
      watchedEpisodes: 12,
      status: 'completed',
    });
    expect(client.execute.mock.calls[1]?.[0].variables).toEqual({
      listEntryId: 1_001,
      progress: 4,
    });
    expect(client.execute.mock.calls[2]?.[0].variables).toEqual({
      listEntryId: 1_001,
      progress: 12,
      status: 'COMPLETED',
    });
  });

  it.each([
    ['watching', 'CURRENT', undefined, 'PAUSED', 3],
    ['completed', 'COMPLETED', 12, 'CURRENT', 3],
    ['on_hold', 'PAUSED', undefined, 'CURRENT', 3],
    ['dropped', 'DROPPED', undefined, 'CURRENT', 3],
    ['plan_to_watch', 'PLANNING', undefined, 'CURRENT', 0],
  ] as const)(
    'maps status %s to %s and applies its progress transition',
    async (
      domainStatus,
      remoteStatus,
      expectedProgress,
      currentStatus,
      currentProgress,
    ) => {
      const returnedProgress = expectedProgress ?? currentProgress;
      const client = createClient([
        collection([
          entry({
            mediaId: 1,
            idMal: 11,
            progress: currentProgress,
            status: currentStatus,
          }),
        ]),
        saved({
          mediaId: 1,
          idMal: 11,
          status: remoteStatus,
          progress: returnedProgress,
          updatedAt: 1_700_000_100,
        }),
      ]);
      const repository = new AniListUserAnimeListRepository({
        client,
        userId: 99,
        maximumAttempts: 1,
        mediaIdentityResolver: identityResolver(),
      });

      await repository.updateStatus(11, domainStatus);
      expect(client.execute.mock.calls[1]?.[0].variables).toEqual({
        listEntryId: 1_001,
        status: remoteStatus,
        ...(expectedProgress === undefined
          ? {}
          : { progress: expectedProgress }),
      });
    },
  );

  it('treats the current status as a valid no-op without a mutation', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11, progress: 3 })]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(
      repository.updateStatus(11, 'watching'),
    ).resolves.toMatchObject({ status: 'watching', watchedEpisodes: 3 });
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects plan-to-watch after progress starts without sending a mutation', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11, progress: 3 })]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.updateStatus(11, 'plan_to_watch')).rejects.toThrow(
      'already_started',
    );
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('rejects completed for a releasing anime without sending a mutation', async () => {
    const client = createClient([
      collection([
        entry({
          mediaId: 1,
          idMal: 11,
          progress: 3,
          mediaStatus: 'RELEASING',
        }),
      ]),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.updateStatus(11, 'completed')).rejects.toThrow(
      'airing_in_progress',
    );
    expect(client.execute).toHaveBeenCalledTimes(1);
  });

  it('keeps watching at the known total while the anime is releasing', async () => {
    const client = createClient([
      collection([
        entry({
          mediaId: 1,
          idMal: 11,
          progress: 11,
          mediaStatus: 'RELEASING',
        }),
      ]),
      saved({
        mediaId: 1,
        idMal: 11,
        progress: 12,
        status: 'CURRENT',
        mediaStatus: 'RELEASING',
      }),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.updateProgress(11, 12)).resolves.toMatchObject({
      watchedEpisodes: 12,
      status: 'watching',
    });
    expect(client.execute.mock.calls[1]?.[0].variables).toEqual({
      listEntryId: 1_001,
      progress: 12,
    });
  });

  it('writes fixed 100-point scores and clears a score with zero', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      saved({ mediaId: 1, idMal: 11, score: 8, updatedAt: 1_700_000_100 }),
      saved({
        mediaId: 1,
        idMal: 11,
        score: 0,
        updatedAt: 1_700_000_200,
      }),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await repository.updateScore(11, 8);
    await expect(repository.updateScore(11, null)).resolves.toMatchObject({
      userScore: null,
    });
    expect(client.execute.mock.calls[1]?.[0].variables).toEqual({
      listEntryId: 1_001,
      scoreRaw: 80,
    });
    expect(client.execute.mock.calls[2]?.[0].variables).toEqual({
      listEntryId: 1_001,
      scoreRaw: 0,
    });
    await expect(repository.updateScore(11, 7.5)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(client.execute).toHaveBeenCalledTimes(3);
  });

  it('deletes an existing entry, updates the snapshot, and skips absent entries', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      deleted(true),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await repository.removeFromList(11);
    await repository.removeFromList(11);
    await expect(repository.getByAnimeId(11)).resolves.toBeNull();
    expect(client.execute.mock.calls[1]?.[0]).toMatchObject({
      query: ANILIST_DELETE_USER_LIST_ENTRY_MUTATION,
      variables: { listEntryId: 1_001 },
    });
    expect(client.execute).toHaveBeenCalledTimes(2);
  });

  it('rejects deleted=false without removing the local entry', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      deleted(false),
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.removeFromList(11)).rejects.toThrow(
      'did not delete',
    );
  });

  it('marks reconnection after an unauthorized mutation', async () => {
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      new AniListUnauthorizedError(),
    ]);
    const onUnauthorized = jest.fn(async () => undefined);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      onUnauthorized,
      maximumAttempts: 2,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.updateScore(11, 8)).rejects.toBeInstanceOf(
      AniListUnauthorizedError,
    );
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(client.execute).toHaveBeenCalledTimes(2);
  });

  it('does not retry mutation network or GraphQL failures', async () => {
    const graphQLError = response(null, [
      { message: 'Rejected mutation', path: ['SaveMediaListEntry'] },
    ]);
    const client = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      graphQLError,
    ]);
    const repository = new AniListUserAnimeListRepository({
      client,
      userId: 99,
      maximumAttempts: 3,
      mediaIdentityResolver: identityResolver(),
    });

    await expect(repository.updateScore(11, 8)).rejects.toBeInstanceOf(
      AniListGraphQLExecutionError,
    );
    expect(client.execute).toHaveBeenCalledTimes(2);

    const networkClient = createClient([
      collection([entry({ mediaId: 1, idMal: 11 })]),
      new AniListNetworkError(),
    ]);
    const networkRepository = new AniListUserAnimeListRepository({
      client: networkClient,
      userId: 99,
      maximumAttempts: 3,
      mediaIdentityResolver: identityResolver(),
    });
    await expect(networkRepository.updateScore(11, 8)).rejects.toBeInstanceOf(
      AniListNetworkError,
    );
    expect(networkClient.execute).toHaveBeenCalledTimes(2);
  });

  it('serializes same-anime mutations so late responses cannot regress progress', async () => {
    let resolveFirstMutation:
      ((value: AniListClientResponse) => void) | undefined;
    let markFirstMutationStarted: (() => void) | undefined;
    const firstMutationStarted = new Promise<void>((resolve) => {
      markFirstMutationStarted = resolve;
    });
    const execute = jest
      .fn()
      .mockResolvedValueOnce(
        collection([entry({ mediaId: 1, idMal: 11, progress: 2 })]),
      )
      .mockImplementationOnce(() => {
        markFirstMutationStarted?.();
        return new Promise<AniListClientResponse>((resolve) => {
          resolveFirstMutation = resolve;
        });
      })
      .mockResolvedValueOnce(
        saved({
          mediaId: 1,
          idMal: 11,
          progress: 4,
          updatedAt: 1_700_000_200,
        }),
      );
    const repository = new AniListUserAnimeListRepository({
      client: { execute },
      userId: 99,
      maximumAttempts: 1,
      mediaIdentityResolver: identityResolver(),
    });

    const first = repository.updateProgress(11, 3);
    const second = repository.updateProgress(11, 4);
    await firstMutationStarted;
    expect(execute).toHaveBeenCalledTimes(2);
    resolveFirstMutation?.(
      saved({
        mediaId: 1,
        idMal: 11,
        progress: 3,
        updatedAt: 1_700_000_100,
      }),
    );
    await expect(first).resolves.toMatchObject({ watchedEpisodes: 3 });
    await expect(second).resolves.toMatchObject({ watchedEpisodes: 4 });
    expect(execute).toHaveBeenCalledTimes(3);
    await expect(repository.getByAnimeId(11)).resolves.toMatchObject({
      watchedEpisodes: 4,
    });
  });
});
