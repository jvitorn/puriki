import type {
  AniListClientPort,
  AniListClientResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import { AniListGraphQLExecutionError } from '@/infrastructure/api/anilist/anilist-errors';
import { AniListMediaIdentityRegistry } from '@/infrastructure/api/anilist/anilist-media-identity';
import { ANILIST_MEDIA_IDENTITY_QUERY } from '@/infrastructure/api/anilist/anilist-queries';

const RATE_LIMIT = {
  limit: 90,
  remaining: 89,
  retryAfterSeconds: null,
  resetAt: null,
};

function response(
  data: unknown,
  errors: AniListClientResponse['errors'] = [],
): AniListClientResponse {
  return {
    data,
    errors,
    status: 200,
    elapsedMs: 10,
    rateLimit: RATE_LIMIT,
  };
}

describe('AniListMediaIdentityRegistry', () => {
  it('reuses remembered catalog identities without network work', async () => {
    const client: jest.Mocked<AniListClientPort> = {
      execute: jest.fn(),
    };
    const registry = new AniListMediaIdentityRegistry({ client });
    registry.remember({
      animeId: 21,
      mediaId: 30_013,
      totalEpisodes: null,
      airingStatus: 'finished',
    });

    await expect(registry.resolve(21)).resolves.toEqual({
      animeId: 21,
      mediaId: 30_013,
      totalEpisodes: null,
      airingStatus: 'finished',
    });
    expect(client.execute).not.toHaveBeenCalled();
  });

  it('falls back to the lean idMal lookup and caches the result', async () => {
    const client: jest.Mocked<AniListClientPort> = {
      execute: jest.fn(
        async (_request: Parameters<AniListClientPort['execute']>[0]) =>
          response({
            Media: {
              id: 30_013,
              idMal: 21,
              episodes: 1_200,
              status: 'RELEASING',
            },
          }),
      ),
    };
    const registry = new AniListMediaIdentityRegistry({
      client,
      maximumAttempts: 1,
    });

    await expect(registry.resolve(21)).resolves.toEqual({
      animeId: 21,
      mediaId: 30_013,
      totalEpisodes: 1_200,
      airingStatus: 'releasing',
    });
    await registry.resolve(21);
    expect(client.execute).toHaveBeenCalledTimes(1);
    expect(client.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        query: ANILIST_MEDIA_IDENTITY_QUERY,
        variables: { idMal: 21 },
      }),
    );
  });

  it('returns null for an unmapped MAL ID and rejects GraphQL errors', async () => {
    const client: jest.Mocked<AniListClientPort> = {
      execute: jest
        .fn()
        .mockResolvedValueOnce(response({ Media: null }))
        .mockResolvedValueOnce(
          response(null, [{ message: 'Lookup failed', path: ['Media'] }]),
        ),
    };
    const registry = new AniListMediaIdentityRegistry({
      client,
      maximumAttempts: 1,
    });

    await expect(registry.resolve(404)).resolves.toBeNull();
    await expect(registry.resolve(405)).rejects.toBeInstanceOf(
      AniListGraphQLExecutionError,
    );
  });
});
