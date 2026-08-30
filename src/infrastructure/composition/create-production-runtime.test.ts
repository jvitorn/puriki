import type { AuthTokenStore } from '@/application/auth/auth-contracts';
import { AniListNetworkError } from '@/infrastructure/api/anilist/anilist-errors';
import { anilistResponse } from '@/infrastructure/api/anilist/anilist-test-fixtures';
import { createProductionRepositoryServices } from '@/infrastructure/composition/create-production-runtime';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { CATALOG_OPERATION_FAMILIES } from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { SyncEngine } from '@/infrastructure/sync/sync-engine';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';
import { InMemoryPendingSyncStore } from '@/tests/sync/in-memory-pending-sync-store';

function testResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: jest.fn(async () => body),
  } as unknown as Response;
}

describe('repository dependency creation', () => {
  it('always creates the production repository graph', () => {
    const dependencies = createProductionRepositoryServices();
    expect(dependencies.catalogRepository).toBeInstanceOf(
      ResilientAnimeCatalogRepository,
    );
    expect(dependencies.userListRepository).toBeInstanceOf(
      GuestUserAnimeListRepository,
    );
    expect(dependencies.getCatalogRuntimeStatus()).toMatchObject({
      primaryProvider: 'anilist',
      primaryHealth: 'healthy',
    });
  });

  it('publishes MAL fallback status without exposing a selectable mode', async () => {
    const primary = createTestDependencies().catalogRepository;
    const fallback = createTestDependencies().catalogRepository;
    jest
      .spyOn(primary, 'getPopular')
      .mockRejectedValueOnce(new AniListNetworkError());
    const dependencies = createProductionRepositoryServices({
      anilistRepository: primary,
      malRepository: fallback,
      malConfigured: true,
    });
    const listener = jest.fn();
    const unsubscribe = dependencies.subscribeCatalogRuntimeStatus(listener);

    await dependencies.catalogRepository.getPopular();

    expect(dependencies.getCatalogRuntimeStatus()).toMatchObject({
      primaryProvider: 'anilist',
      operations: {
        popular: {
          lastSuccessfulSource: 'mal',
          circuitState: 'closed',
          lastFallbackAt: expect.any(String),
        },
      },
    });
    expect(dependencies).not.toHaveProperty('mode');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('shares the AniList rate budget without changing family circuits', async () => {
    const circuitRegistry = new CatalogCircuitBreakerRegistry();
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      anilistResponse({ errors: [{ message: 'Too many requests' }] }, 429, {
        'Retry-After': '10',
        'X-RateLimit-Remaining': '0',
      }),
    );
    try {
      const dependencies = createProductionRepositoryServices({
        circuitRegistry,
        malConfigured: false,
      });

      await expect(dependencies.runAniListDiagnostic()).resolves.toMatchObject({
        summary: { stoppedByRateLimit: true },
      });
      expect(dependencies.getCatalogRuntimeStatus()).toMatchObject({
        primaryHealth: 'rate_limited',
        primaryRateLimitedUntil: expect.any(String),
      });
      await expect(dependencies.catalogRepository.getPopular()).rejects.toThrow(
        'primary catalog is unavailable',
      );
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      CATALOG_OPERATION_FAMILIES.forEach((family) => {
        expect(circuitRegistry.get(family).getSnapshot()).toMatchObject({
          state: 'closed',
          consecutiveFailures: 0,
          lastFailureAt: null,
        });
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('marks the active AniList account for reconnection when its token expired', async () => {
    const session = new TestAuthSessionController();
    session.updateConnection('anilist', {
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'reader',
        avatarUrl: null,
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    const markReconnectRequired = jest.spyOn(session, 'markReconnectRequired');
    const tokenStore: jest.Mocked<AuthTokenStore> = {
      get: jest.fn(async (_provider: Parameters<AuthTokenStore['get']>[0]) => ({
        version: 1 as const,
        accessToken: 'expired-token',
        refreshToken: null,
        expiresAt: '2020-01-01T00:00:00.000Z',
      })),
      set: jest.fn(
        async (
          _provider: Parameters<AuthTokenStore['set']>[0],
          _value: Parameters<AuthTokenStore['set']>[1],
        ) => undefined,
      ),
      remove: jest.fn(
        async (_provider: Parameters<AuthTokenStore['remove']>[0]) => undefined,
      ),
    };
    const catalog = createTestDependencies().catalogRepository;
    const dependencies = createProductionRepositoryServices({
      anilistRepository: catalog,
      malRepository: catalog,
      authSession: session,
      authTokenStore: tokenStore,
      pendingSyncStore: new InMemoryPendingSyncStore(),
    });

    await expect(
      dependencies.userListRepository.getPage({ page: 1, pageSize: 25 }),
    ).rejects.toMatchObject({ code: 'session_expired' });
    expect(tokenStore.get).toHaveBeenCalledWith('anilist');
    expect(markReconnectRequired).toHaveBeenCalledWith('anilist');
    (dependencies.syncEngine as SyncEngine).dispose();
  });

  it('refreshes an expired MAL access token before an authenticated list read', async () => {
    const session = new TestAuthSessionController();
    session.updateConnection('mal', {
      state: 'connected',
      account: {
        provider: 'mal',
        userId: '7',
        username: 'reader',
        avatarUrl: null,
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    const tokenStore: jest.Mocked<AuthTokenStore> = {
      get: jest.fn(async (_provider: Parameters<AuthTokenStore['get']>[0]) => ({
        version: 1 as const,
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        expiresAt: '2020-01-01T00:00:00.000Z',
      })),
      set: jest.fn(
        async (
          _provider: Parameters<AuthTokenStore['set']>[0],
          _value: Parameters<AuthTokenStore['set']>[1],
        ) => undefined,
      ),
      remove: jest.fn(
        async (_provider: Parameters<AuthTokenStore['remove']>[0]) => undefined,
      ),
    };
    const malOAuthClient = {
      authorize: jest.fn(),
      refresh: jest.fn(async () => ({
        accessToken: 'refreshed-token',
        refreshToken: 'next-refresh-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
      })),
    };
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(testResponse('{"data":[],"paging":{}}'));
    const catalog = createTestDependencies().catalogRepository;
    const dependencies = createProductionRepositoryServices({
      anilistRepository: catalog,
      malRepository: catalog,
      authSession: session,
      authTokenStore: tokenStore,
      malOAuthClient,
      pendingSyncStore: new InMemoryPendingSyncStore(),
    });

    try {
      await expect(
        dependencies.userListRepository.getPage({ page: 1, pageSize: 25 }),
      ).resolves.toMatchObject({ items: [], totalCount: 0 });
      expect(malOAuthClient.refresh).toHaveBeenCalledWith('refresh-token');
      expect(tokenStore.set).toHaveBeenCalledWith('mal', {
        version: 1,
        accessToken: 'refreshed-token',
        refreshToken: 'next-refresh-token',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/users/@me/animelist'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer refreshed-token',
          }),
        }),
      );
    } finally {
      fetchSpy.mockRestore();
      (dependencies.syncEngine as SyncEngine).dispose();
    }
  });

  it('keeps the Sync Engine target on guest while AniList is connected', async () => {
    const session = new TestAuthSessionController();
    const source = createTestDependencies().catalogRepository;
    const dependencies = createProductionRepositoryServices({
      anilistRepository: source,
      malRepository: source,
      authSession: session,
      authTokenStore: {
        get: jest.fn(async () => null),
        set: jest.fn(async () => undefined),
        remove: jest.fn(async () => undefined),
      },
      pendingSyncStore: new InMemoryPendingSyncStore(),
    });
    const [anime] = await dependencies.catalogRepository.getPopular();
    if (!anime) throw new Error('Expected a catalog item.');
    await dependencies.userListRepository.addToList(anime.id, 'watching');

    session.updateConnection('anilist', {
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'reader',
        avatarUrl: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await dependencies.syncEngine.enqueue({
      animeId: anime.id,
      type: 'SET_PROGRESS',
      value: 7,
    });
    await dependencies.syncEngine.processPending();

    session.updateConnection('anilist', {
      state: 'disconnected',
      account: null,
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await expect(
      dependencies.userListRepository.getByAnimeId(anime.id),
    ).resolves.toMatchObject({ watchedEpisodes: 7 });
    (dependencies.syncEngine as SyncEngine).dispose();
  });
});
