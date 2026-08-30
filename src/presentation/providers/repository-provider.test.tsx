import { act, fireEvent, screen } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Pressable, Text } from 'react-native';

import { createAppQueryClient } from '@/presentation/providers/app-providers';
import {
  useRepositories,
  useSyncStatus,
} from '@/presentation/providers/repository-provider';
import { queryKeys } from '@/presentation/queries/query-keys';
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

describe('RepositoryProvider', () => {
  it('keeps explicit dependencies stable and clears only catalog queries', async () => {
    const queryClient = createAppQueryClient();
    const dependencies = createTestDependencies();
    const clearCatalogCache = jest.spyOn(dependencies, 'clearCatalogCache');
    const observeRepository = jest.fn();
    queryClient.setQueryData(queryKeys.popular, 'catalog data');
    queryClient.setQueryData(queryKeys.continueWatching('guest'), 'guest data');

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
    expect(queryClient.getQueryData(queryKeys.continueWatching('guest'))).toBe(
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
