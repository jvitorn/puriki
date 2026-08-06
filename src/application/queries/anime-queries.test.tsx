import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useUpdateProgress } from '@/application/mutations/anime-mutations';
import {
  useAnimeSearch,
  usePopularAnime,
  useUnifiedUserList,
} from '@/application/queries/anime-queries';
import { queryKeys } from '@/application/queries/query-keys';
import type {
  AnimeCatalogItem,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { createTestWrapper } from '@/tests/render/test-render';

describe('React Query integration', () => {
  it('moves a catalog query from loading to success', async () => {
    const dependencies = createTestDependencies();
    let resolvePopular: (items: AnimeCatalogItem[]) => void = () => undefined;
    dependencies.catalogRepository.getPopular = jest.fn(
      () =>
        new Promise<AnimeCatalogItem[]>((resolve) => {
          resolvePopular = resolve;
        }),
    );
    const { result } = await renderHook(() => usePopularAnime(), {
      wrapper: createTestWrapper(dependencies),
    });
    expect(result.current.isLoading).toBe(true);
    await act(async () => resolvePopular([]));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(0);
  });

  it('exposes repository query errors', async () => {
    const dependencies = createTestDependencies();
    dependencies.setForceErrors(true);
    const { result } = await renderHook(() => usePopularAnime(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain('could not complete');
  });

  it('uses popular discovery data until search has two normalized characters', async () => {
    const dependencies = createTestDependencies();
    const popular = jest.spyOn(dependencies.catalogRepository, 'getPopular');
    const search = jest.spyOn(dependencies.catalogRepository, 'search');
    const { result } = await renderHook(() => useAnimeSearch(' N '), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(popular).toHaveBeenCalledTimes(1);
    expect(search).not.toHaveBeenCalled();
  });

  it('normalizes remote search text before creating a request', async () => {
    const dependencies = createTestDependencies();
    const search = jest.spyOn(dependencies.catalogRepository, 'search');
    const { result } = await renderHook(
      () => useAnimeSearch('  Néon   RONIN '),
      { wrapper: createTestWrapper(dependencies) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(search).toHaveBeenCalledWith('neon ronin');
  });

  it('unifies the personal list with one bulk catalog lookup', async () => {
    const dependencies = createTestDependencies();
    const getMany = jest.spyOn(dependencies.catalogRepository, 'getManyByIds');
    const { result } = await renderHook(() => useUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(25);
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany.mock.calls[0]?.[0]).toHaveLength(25);
  });

  it('optimistically updates progress and rolls back a failed mutation', async () => {
    const dependencies = createTestDependencies();
    let rejectUpdate: (error: Error) => void = () => undefined;
    dependencies.userListRepository.updateProgress = jest.fn(
      () =>
        new Promise<UserAnimeEntry>((_resolve, reject) => {
          rejectUpdate = reject;
        }),
    );
    const queryClient = createAppQueryClient();
    const cached = buildWatchingAnime({ id: 101 });
    queryClient.setQueryData(queryKeys.details(101), cached);
    const { result } = await renderHook(() => useUpdateProgress(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 101, episodes: 5 }));
    await waitFor(() => {
      const optimistic = queryClient.getQueryData<UnifiedAnime>(
        queryKeys.details(101),
      );
      expect(optimistic?.userEntry?.watchedEpisodes).toBe(5);
    });
    await act(async () => rejectUpdate(new Error('Mutation failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<UnifiedAnime>(queryKeys.details(101))?.userEntry
        ?.watchedEpisodes,
    ).toBe(4);
  });

  it('invalidates affected caches after a successful mutation', async () => {
    const dependencies = createTestDependencies();
    const queryClient = createAppQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateProgress(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });
    await act(async () => result.current.mutate({ animeId: 1, episodes: 2 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.unifiedListRoot,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.userListRoot,
    });
  });

  it('creates isolated query clients for every test or app boundary', () => {
    const first = createAppQueryClient();
    const second = createAppQueryClient();
    first.setQueryData(['sample'], 'first');
    expect(second).not.toBe(first);
    expect(second.getQueryData(['sample'])).toBeUndefined();
    expect(first).toBeInstanceOf(QueryClient);
  });
});
