import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  useResetSessionData,
  useUpdateProgress,
  useUpdateScore,
  useUpdateStatus,
} from '@/application/mutations/anime-mutations';
import {
  useAnimeSearch,
  useContinueWatching,
  useInfiniteUnifiedUserList,
  usePopularAnime,
} from '@/application/queries/anime-queries';
import { queryKeys } from '@/application/queries/query-keys';
import { flattenUniqueAnimePages } from '@/application/use-cases/infinite-user-list';
import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { SessionUserAnimeListRepository } from '@/infrastructure/repositories/session/session-user-anime-list-repository';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { buildUserListDataset } from '@/tests/builders/mock-dataset-builder';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { createTestWrapper } from '@/tests/render/test-render';

function createCatalogMock(
  catalog: AnimeCatalogItem[],
): jest.Mocked<AnimeCatalogRepository> {
  return {
    getFeatured: jest.fn(async () => catalog[0] as AnimeCatalogItem),
    getPopular: jest.fn(async () => catalog),
    getSeasonal: jest.fn(async () => catalog),
    getUpcoming: jest.fn(async () => catalog),
    search: jest.fn(async (_query: string) => catalog),
    getManyByIds: jest.fn(async (_ids: number[]) => catalog),
    getDetailsById: jest.fn(
      async (id) => catalog.find((item) => item.id === id) ?? null,
    ),
    clearCache: jest.fn(),
  };
}

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

  it('loads and hydrates only the first page of a 250-entry list', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 250 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const getMany = jest.spyOn(dependencies.catalogRepository, 'getManyByIds');
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items).toHaveLength(25);
    expect(getPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      status: undefined,
    });
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany.mock.calls[0]?.[0]).toHaveLength(25);
  });

  it('renders two large-list pages from normalized known items with zero detail traffic', async () => {
    const dataset = buildUserListDataset({ size: 250 });
    const dependencies = createTestDependencies(dataset);
    const primary = createCatalogMock(dataset.catalog);
    const fallback = createCatalogMock(dataset.catalog);
    const catalogRepository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await catalogRepository.getPopular();
    dependencies.catalogRepository = catalogRepository;
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    expect(result.current.data?.pages[0]?.items).toHaveLength(25);
    expect(result.current.data?.pages[1]?.items).toHaveLength(25);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
    expect(primary.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getManyByIds).not.toHaveBeenCalled();
  });

  it('renders the session-generated My List page with zero detail traffic', async () => {
    const dataset = buildUserListDataset({ size: 30 });
    const dependencies = createTestDependencies(dataset);
    const primary = createCatalogMock(dataset.catalog);
    const fallback = createCatalogMock(dataset.catalog);
    const catalogRepository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    dependencies.catalogRepository = catalogRepository;
    dependencies.userListRepository = new SessionUserAnimeListRepository(
      catalogRepository,
      { random: () => 0.25 },
    );
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0]?.items).toHaveLength(23);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
    expect(primary.getManyByIds).not.toHaveBeenCalled();
    expect(fallback.getManyByIds).not.toHaveBeenCalled();
  });

  it('appends pages progressively and stops at the final page', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 250 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));

    for (let page = 2; page <= 10; page += 1) {
      await act(async () => result.current.fetchNextPage());
      await waitFor(() =>
        expect(result.current.data?.pages).toHaveLength(page),
      );
    }

    expect(flattenUniqueAnimePages(result.current.data?.pages)).toHaveLength(
      250,
    );
    expect(result.current.hasNextPage).toBe(false);
    expect(getPage).toHaveBeenCalledTimes(10);
  });

  it('deduplicates overlapping page IDs while preserving first-seen order', () => {
    const first = buildWatchingAnime({ id: 101, title: 'First' });
    const second = buildWatchingAnime({ id: 102, title: 'Second' });
    const duplicate = {
      ...first,
      anime: { ...first.anime, title: 'Duplicate response' },
    };
    const pages: PageResult<UnifiedAnime>[] = [
      {
        items: [first, second],
        page: 1,
        nextPage: 2,
        totalCount: null,
      },
      {
        items: [duplicate],
        page: 2,
        nextPage: null,
        totalCount: null,
      },
    ];
    expect(
      flattenUniqueAnimePages(pages).map((item) => item.anime.title),
    ).toEqual(['First', 'Second']);
  });

  it('preserves page 1 after a page 2 error and retries only page 2', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 53 }),
    );
    const originalGetPage = dependencies.userListRepository.getPage.bind(
      dependencies.userListRepository,
    );
    let failPageTwo = true;
    dependencies.userListRepository.getPage = jest.fn(async (request) => {
      if (request.page === 2 && failPageTwo) {
        throw new Error('Page 2 failed');
      }
      return originalGetPage(request);
    });
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.data?.pages).toHaveLength(1);
    expect(result.current.data?.pages[0]?.items).toHaveLength(25);

    failPageTwo = false;
    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(result.current.data?.pages[1]?.page).toBe(2);
  });

  it('uses isolated page-1 caches when the status filter changes', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 250 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const { result, rerender } = await renderHook(
      ({ status }: { status?: AnimeListStatus }) =>
        useInfiniteUnifiedUserList(status),
      {
        initialProps: { status: undefined },
        wrapper: createTestWrapper(dependencies),
      },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

    rerender({ status: 'completed' });
    await waitFor(() =>
      expect(result.current.data?.pages[0]?.items[0]?.userEntry?.status).toBe(
        'completed',
      ),
    );
    expect(result.current.data?.pages).toHaveLength(1);
    expect(getPage).toHaveBeenLastCalledWith({
      page: 1,
      pageSize: 25,
      status: 'completed',
    });
  });

  it('refreshes a multi-page list from page 1 without refetching old pages', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 250 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    for (let page = 2; page <= 5; page += 1) {
      await act(async () => result.current.fetchNextPage());
    }
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(5));
    getPage.mockClear();

    await act(async () => result.current.refreshFromStart());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1));
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      status: undefined,
    });

    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(getPage).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 25,
      status: undefined,
    });
  });

  it('resets active infinite queries to a freshly loaded page 1', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 53 }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const queryClient = createAppQueryClient();
    const listHook = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });
    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));
    await act(async () => listHook.result.current.fetchNextPage());
    await waitFor(() =>
      expect(listHook.result.current.data?.pages).toHaveLength(2),
    );
    getPage.mockClear();
    const resetHook = await renderHook(() => useResetSessionData(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => resetHook.result.current.mutate());
    await waitFor(() => expect(resetHook.result.current.isSuccess).toBe(true));
    expect(listHook.result.current.data?.pages).toHaveLength(1);
    expect(getPage).toHaveBeenCalledTimes(1);
    expect(getPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 25,
      status: undefined,
    });
  });

  it('bounds Continue Watching to the first 10 Watching entries', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 200, status: 'watching' }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    const getMany = jest.spyOn(dependencies.catalogRepository, 'getManyByIds');
    const { result } = await renderHook(() => useContinueWatching(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(10);
    expect(getPage).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      status: 'watching',
    });
    expect(getMany.mock.calls[0]?.[0]).toHaveLength(10);
  });

  it('builds Continue Watching from normalized known items with zero detail traffic', async () => {
    const dataset = buildUserListDataset({ size: 200, status: 'watching' });
    const dependencies = createTestDependencies(dataset);
    const primary = createCatalogMock(dataset.catalog);
    const fallback = createCatalogMock(dataset.catalog);
    const catalogRepository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    await catalogRepository.getSeasonal();
    dependencies.catalogRepository = catalogRepository;
    const { result } = await renderHook(() => useContinueWatching(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(10);
    expect(primary.getDetailsById).not.toHaveBeenCalled();
    expect(fallback.getDetailsById).not.toHaveBeenCalled();
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

  it('updates a later infinite page and restores it after failure', async () => {
    const dependencies = createTestDependencies();
    const queryClient = createAppQueryClient();
    const pages = Array.from({ length: 4 }, (_, index) => {
      const item = buildWatchingAnime({
        id: 101 + index,
        title: `Page ${index + 1}`,
      });
      return {
        items: [item],
        page: index + 1,
        nextPage: index === 3 ? null : index + 2,
        totalCount: 4,
      } satisfies PageResult<UnifiedAnime>;
    });
    const cached: InfiniteData<PageResult<UnifiedAnime>, number> = {
      pages,
      pageParams: [1, 2, 3, 4],
    };
    queryClient.setQueryData(queryKeys.infiniteUserList(), cached);
    let rejectUpdate: (error: Error) => void = () => undefined;
    dependencies.userListRepository.updateProgress = jest.fn(
      () =>
        new Promise<UserAnimeEntry>((_resolve, reject) => {
          rejectUpdate = reject;
        }),
    );
    const { result } = await renderHook(() => useUpdateProgress(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 104, episodes: 8 }));
    await waitFor(() => {
      const optimistic = queryClient.getQueryData<typeof cached>(
        queryKeys.infiniteUserList(),
      );
      expect(optimistic?.pages[3]?.items[0]?.userEntry?.watchedEpisodes).toBe(
        8,
      );
      expect(optimistic?.pages.slice(0, 3)).toEqual(cached.pages.slice(0, 3));
    });
    await act(async () => rejectUpdate(new Error('Mutation failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.infiniteUserList())).toEqual(
      cached,
    );
  });

  it('removes a status transition from a filtered infinite cache', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 30, status: 'watching' }),
    );
    const queryClient = createAppQueryClient();
    const listHook = await renderHook(
      () => useInfiniteUnifiedUserList('watching'),
      { wrapper: createTestWrapper(dependencies, queryClient) },
    );
    await waitFor(() => expect(listHook.result.current.isSuccess).toBe(true));
    const animeId =
      listHook.result.current.data?.pages[0]?.items[0]?.anime.id ?? 0;
    const mutation = await renderHook(() => useUpdateStatus(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () =>
      mutation.result.current.mutate({ animeId, status: 'completed' }),
    );
    await waitFor(() => expect(mutation.result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<
      InfiniteData<PageResult<UnifiedAnime>, number>
    >(queryKeys.infiniteUserList('watching'));
    expect(
      cached?.pages
        .flatMap((page) => page.items)
        .some((item) => item.anime.id === animeId),
    ).toBe(false);
    expect(cached?.pages[0]?.totalCount).toBe(29);
  });

  it('uses targeted non-refetching invalidation after a score update', async () => {
    const dependencies = createTestDependencies();
    const queryClient = createAppQueryClient();
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const { result } = await renderHook(() => useUpdateScore(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });
    await act(async () => result.current.mutate({ animeId: 1, score: 9 }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(
      invalidate.mock.calls.every(
        ([filters]) => filters && filters.refetchType === 'none',
      ),
    ).toBe(true);
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
