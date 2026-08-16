import { AuthOperationError } from '@/application/auth/auth-contracts';
import { anilistResponse } from '@/infrastructure/api/anilist/anilist-test-fixtures';
import {
  ANILIST_VIEWER_QUERY,
  ANILIST_VIEWER_TIMEOUT_MS,
  AniListViewerClient,
} from '@/infrastructure/auth/anilist/anilist-viewer-client';

describe('AniListViewerClient', () => {
  it('uses a Bearer token and maps only the neutral viewer identity', async () => {
    const fetchImpl = jest.fn(async () =>
      anilistResponse({
        data: {
          Viewer: {
            id: 42,
            name: 'aiko',
            avatar: { large: 'https://cdn.example.com/aiko.png' },
            ignored: 'provider-only',
          },
        },
      }),
    );
    const client = new AniListViewerClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getViewer('secret-token')).resolves.toEqual({
      id: 42,
      name: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret-token',
        },
        body: JSON.stringify({ query: ANILIST_VIEWER_QUERY, variables: {} }),
      }),
    );
  });

  it('accepts an absent avatar', async () => {
    const client = new AniListViewerClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ data: { Viewer: { id: 7, name: 'no-avatar' } } }),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).resolves.toEqual({
      id: 7,
      name: 'no-avatar',
      avatarUrl: null,
    });
  });

  it.each([
    [401, { errors: [{ message: 'Unauthorized' }] }],
    [403, { errors: [{ message: 'Forbidden' }] }],
    [200, { errors: [{ message: 'Unauthenticated.', status: 400 }] }],
  ] as const)(
    'classifies status %i as an invalid token',
    async (status, body) => {
      const client = new AniListViewerClient({
        fetchImpl: jest.fn(async () =>
          anilistResponse(body, status),
        ) as unknown as typeof fetch,
      });
      await expect(client.getViewer('token')).rejects.toMatchObject({
        code: 'invalid_token',
        reconnectRequired: true,
      });
    },
  );

  it.each([
    [500, 'provider_unavailable'],
    [429, 'provider_unavailable'],
    [200, 'invalid_response'],
  ] as const)('keeps status %i retryable as %s', async (status, code) => {
    const client = new AniListViewerClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ errors: [{ message: 'temporary' }] }, status),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).rejects.toMatchObject({
      code,
      canRetry: true,
    });
  });

  it('classifies network and timeout without returning raw errors', async () => {
    const networkClient = new AniListViewerClient({
      fetchImpl: jest.fn(async () => {
        throw new Error('raw network error');
      }) as unknown as typeof fetch,
    });
    await expect(networkClient.getViewer('token')).rejects.toEqual(
      new AuthOperationError('network', { canRetry: true }),
    );

    const timeoutClient = new AniListViewerClient({
      fetchImpl: jest.fn(async () => {
        throw new Error('aborted');
      }) as unknown as typeof fetch,
      setTimeoutImpl: ((handler: TimerHandler, timeout?: number) => {
        expect(timeout).toBe(ANILIST_VIEWER_TIMEOUT_MS);
        if (typeof handler === 'function') handler();
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: jest.fn() as unknown as typeof clearTimeout,
    });
    await expect(timeoutClient.getViewer('token')).rejects.toEqual(
      new AuthOperationError('timeout', { canRetry: true }),
    );
  });

  it('rejects malformed envelopes and viewer fields', async () => {
    const client = new AniListViewerClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ data: { Viewer: { id: '42', name: null } } }),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).rejects.toMatchObject({
      code: 'invalid_response',
      canRetry: true,
    });
  });
});
