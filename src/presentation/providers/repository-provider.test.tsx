import { act, fireEvent, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { queryKeys } from '@/application/queries/query-keys';
import { AniListNetworkError } from '@/infrastructure/api/anilist/anilist-errors';
import { anilistResponse } from '@/infrastructure/api/anilist/anilist-test-fixtures';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { CATALOG_OPERATION_FAMILIES } from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import {
  createDefaultDependencies,
  createProductionDependencies,
  useRepositories,
  useSyncStatus,
} from '@/presentation/providers/repository-provider';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

function RepositoryProbe({
  onRepository,
}: {
  onRepository(repository: unknown): void;
}) {
  const dependencies = useRepositories();
  useEffect(() => {
    onRepository(dependencies.userListRepository);
  }, [dependencies.userListRepository, onRepository]);
  return (
    <Pressable onPress={dependencies.clearCatalogCache}>
      <Text>Clear catalog</Text>
    </Pressable>
  );
}

function SyncStatusProbe() {
  const status = useSyncStatus();
  return (
    <Text>{`${status.pendingCount}:${status.failedCount}:${status.syncing}`}</Text>
  );
}

describe('repository dependency creation', () => {
  it('always creates the production repository graph', () => {
    const dependencies = createDefaultDependencies();
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
    const dependencies = createProductionDependencies({
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
      const dependencies = createProductionDependencies({
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
});

describe('RepositoryProvider', () => {
  it('keeps explicit dependencies stable and clears only catalog queries', async () => {
    const queryClient = createAppQueryClient();
    const dependencies = createTestDependencies();
    const clearCatalogCache = jest.spyOn(dependencies, 'clearCatalogCache');
    const observeRepository = jest.fn();
    queryClient.setQueryData(queryKeys.popular, 'catalog data');
    queryClient.setQueryData(queryKeys.continueWatching, 'guest data');

    const rendered = await renderWithProviders(
      <RepositoryProbe onRepository={observeRepository} />,
      { dependencies, queryClient },
    );
    await rendered.rerender(
      <RepositoryProbe onRepository={observeRepository} />,
    );
    await fireEvent.press(screen.getByText('Clear catalog'));

    expect(observeRepository).toHaveBeenCalledTimes(1);
    expect(clearCatalogCache).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.popular)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.continueWatching)).toBe(
      'guest data',
    );
  });

  it('exposes a stable sync status subscription to presentation', async () => {
    const dependencies = createTestDependencies();
    let status = dependencies.syncEngine.getStatus();
    const listeners = new Set<() => void>();
    dependencies.syncEngine = {
      enqueue: jest.fn(async () => undefined),
      processPending: jest.fn(async () => undefined),
      getStatus: () => status,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    await renderWithProviders(<SyncStatusProbe />, { dependencies });
    expect(await screen.findByText('0:0:false')).toBeVisible();

    await act(async () => {
      status = {
        pendingCount: 2,
        failedCount: 1,
        syncing: true,
        storageError: false,
      };
      listeners.forEach((listener) => listener());
    });

    expect(await screen.findByText('2:1:true')).toBeVisible();
  });
});
