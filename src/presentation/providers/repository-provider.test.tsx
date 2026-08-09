import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import animeCollectionFixture from '@/infrastructure/api/jikan/fixtures/anime-collection.json';
import { JikanNetworkError } from '@/infrastructure/api/jikan/jikan-errors';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import {
  createAutomaticDependencies,
  createDefaultDependencies,
  createJikanDependencies,
  createMalDependencies,
  createMockDependencies,
  useRepositories,
} from '@/presentation/providers/repository-provider';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

function DataSourceProbe({
  onRepository,
}: {
  onRepository?(repository: unknown): void;
}) {
  const { mode, selectDataSourceMode, userListRepository } = useRepositories();
  useEffect(() => {
    onRepository?.(userListRepository);
  }, [onRepository, userListRepository]);
  return (
    <>
      <Text accessibilityLabel="Current source">{mode}</Text>
      {(['automatic', 'jikan', 'mal', 'mock'] as const).map((source) => (
        <Pressable
          key={source}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${source}`}
          onPress={() => selectDataSourceMode(source)}
        >
          <Text>{source}</Text>
        </Pressable>
      ))}
    </>
  );
}

describe('repository dependency creation', () => {
  it('keeps mock as the default mode under automated tests', () => {
    expect(createDefaultDependencies().mode).toBe('mock');
  });

  it('uses automatic as the default mode outside tests', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    expect(createDefaultDependencies().mode).toBe('automatic');
    process.env.NODE_ENV = previousNodeEnv;
  });

  it('creates the expected catalog implementation for every mode', () => {
    expect(createAutomaticDependencies().catalogRepository).toBeInstanceOf(
      ResilientAnimeCatalogRepository,
    );
    expect(createJikanDependencies().mode).toBe('jikan');
    expect(createMalDependencies().mode).toBe('mal');
    expect(createMockDependencies().catalogRepository).toBeInstanceOf(
      MockAnimeCatalogRepository,
    );
  });

  it('publishes automatic runtime source and fallback status without catalog metadata', async () => {
    const primary = createTestDependencies().catalogRepository;
    const fallback = createTestDependencies().catalogRepository;
    jest
      .spyOn(primary, 'getPopular')
      .mockRejectedValueOnce(new JikanNetworkError());
    const dependencies = createAutomaticDependencies({
      jikanRepository: primary,
      malRepository: fallback,
      malConfigured: true,
    });
    const listener = jest.fn();
    const unsubscribe = dependencies.subscribeCatalogRuntimeStatus(listener);
    await dependencies.catalogRepository.getPopular();
    expect(dependencies.catalogRuntimeStatus).toMatchObject({
      mode: 'automatic',
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
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('shares one request budget between automatic catalog traffic and Jikan diagnostics', async () => {
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
      const dependencies = createAutomaticDependencies({
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
});

describe('RepositoryProvider', () => {
  it('switches among four modes, clears queries, and reconstructs the session list', async () => {
    const queryClient = createAppQueryClient();
    const dependencies = createTestDependencies();
    const initialUserList = dependencies.userListRepository;
    const observeRepository = jest.fn();
    queryClient.setQueryData(['stale-catalog'], 'mock data');
    await renderWithProviders(
      <DataSourceProbe onRepository={observeRepository} />,
      {
        dependencies,
        queryClient,
      },
    );
    expect(screen.getByLabelText('Current source')).toHaveTextContent('mock');

    fireEvent.press(screen.getByLabelText('Switch to automatic'));
    await waitFor(() =>
      expect(screen.getByLabelText('Current source')).toHaveTextContent(
        'automatic',
      ),
    );
    expect(queryClient.getQueryData(['stale-catalog'])).toBeUndefined();
    expect(
      observeRepository.mock.calls[
        observeRepository.mock.calls.length - 1
      ]?.[0],
    ).not.toBe(initialUserList);

    fireEvent.press(screen.getByLabelText('Switch to jikan'));
    await waitFor(() =>
      expect(screen.getByLabelText('Current source')).toHaveTextContent(
        'jikan',
      ),
    );
    fireEvent.press(screen.getByLabelText('Switch to mal'));
    await waitFor(() =>
      expect(screen.getByLabelText('Current source')).toHaveTextContent('mal'),
    );
    fireEvent.press(screen.getByLabelText('Switch to mock'));
    await waitFor(() =>
      expect(screen.getByLabelText('Current source')).toHaveTextContent('mock'),
    );
  });
});
