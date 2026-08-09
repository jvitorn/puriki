import { fireEvent, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { queryKeys } from '@/application/queries/query-keys';
import animeCollectionFixture from '@/infrastructure/api/jikan/fixtures/anime-collection.json';
import { JikanNetworkError } from '@/infrastructure/api/jikan/jikan-errors';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { JIKAN_OPERATION_FAMILIES } from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import {
  createDefaultDependencies,
  createProductionDependencies,
  useRepositories,
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

describe('repository dependency creation', () => {
  it('always creates the production repository graph, including under tests', () => {
    const dependencies = createDefaultDependencies();
    expect(dependencies.catalogRepository).toBeInstanceOf(
      ResilientAnimeCatalogRepository,
    );
    expect(dependencies.userListRepository).toBeInstanceOf(
      GuestUserAnimeListRepository,
    );
  });

  it('publishes fallback status without exposing a selectable mode', async () => {
    const primary = createTestDependencies().catalogRepository;
    const fallback = createTestDependencies().catalogRepository;
    jest
      .spyOn(primary, 'getPopular')
      .mockRejectedValueOnce(new JikanNetworkError());
    const dependencies = createProductionDependencies({
      jikanRepository: primary,
      malRepository: fallback,
      malConfigured: true,
    });
    const listener = jest.fn();
    const unsubscribe = dependencies.subscribeCatalogRuntimeStatus(listener);

    await dependencies.catalogRepository.getPopular();

    expect(dependencies.getCatalogRuntimeStatus()).toMatchObject({
      jikanHealth: 'healthy',
      operations: {
        popular: {
          lastSuccessfulSource: 'mal',
          circuitState: 'closed',
          lastFallbackAt: expect.any(String),
        },
        details: {
          lastSuccessfulSource: null,
          circuitState: 'closed',
        },
      },
    });
    expect(dependencies).not.toHaveProperty('mode');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('shares one request budget between catalog traffic and Jikan diagnostics', async () => {
    let currentTime = 0;
    const starts: number[] = [];
    const scheduler = new JikanRequestScheduler({
      requestIntervalMs: 0,
      sustainedRequestLimit: 5,
      sustainedWindowMs: 1_000,
      now: () => currentTime,
      sleep: async (milliseconds) => {
        currentTime += milliseconds;
      },
    });
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        starts.push(currentTime);
        const url = String(input);
        const body = url.endsWith('/top/anime')
          ? JSON.stringify(animeCollectionFixture)
          : url.includes('/anime/1/full')
            ? '{"data":{}}'
            : '{"data":[]}';
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          text: jest.fn(async () => body),
        } as unknown as Response;
      });
    try {
      const dependencies = createProductionDependencies({
        jikanScheduler: scheduler,
        malConfigured: false,
      });
      await expect(dependencies.runJikanDiagnostic()).resolves.toMatchObject({
        health: 'healthy',
      });
      await expect(
        dependencies.catalogRepository.getPopular(),
      ).resolves.toHaveLength(2);
      expect(starts).toEqual([0, 0, 0, 0, 0, 1_000]);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each([429, 504])(
    'keeps every runtime circuit unchanged after a failing %s diagnostic',
    async (status) => {
      const circuitRegistry = new CatalogCircuitBreakerRegistry();
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status,
        headers: { get: () => null },
        text: jest.fn(async () => JSON.stringify({ status })),
      } as unknown as Response);
      try {
        const dependencies = createProductionDependencies({
          circuitRegistry,
          jikanScheduler: new JikanRequestScheduler({ requestIntervalMs: 0 }),
          malConfigured: false,
        });

        await expect(dependencies.runJikanDiagnostic()).resolves.toMatchObject({
          health: status === 429 ? 'rate_limited' : 'unavailable',
        });
        JIKAN_OPERATION_FAMILIES.forEach((family) => {
          expect(circuitRegistry.get(family).getSnapshot()).toMatchObject({
            state: 'closed',
            consecutiveFailures: 0,
            lastFailureAt: null,
            lastSuccessAt: null,
          });
        });
      } finally {
        fetchSpy.mockRestore();
      }
    },
  );
});

describe('RepositoryProvider', () => {
  it('keeps explicit test dependencies stable and clears repository and query caches together', async () => {
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
    rendered.rerender(<RepositoryProbe onRepository={observeRepository} />);
    await fireEvent.press(screen.getByText('Clear catalog'));

    expect(observeRepository).toHaveBeenCalledTimes(1);
    expect(observeRepository).toHaveBeenCalledWith(
      dependencies.userListRepository,
    );
    expect(clearCatalogCache).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.popular)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.continueWatching)).toBe(
      'guest data',
    );
  });
});
