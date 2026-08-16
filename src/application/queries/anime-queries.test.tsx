import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  useAddToList,
  useRemoveFromList,
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
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { buildUserListDataset } from '@/tests/fixtures/anime-dataset';
import { createTestWrapper } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

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
    getKnownById: jest.fn(
      (id) => catalog.find((item) => item.id === id) ?? null,
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
    dependencies.catalogRepository.getPopular = jest.fn(async () => {
      throw new Error('The test repository could not complete this request.');
    });
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

  it('renders an empty guest My List page with zero detail traffic', async () => {
    const dataset = buildUserListDataset({ size: 30 });
    const dependencies = createTestDependencies(dataset);
    const primary = createCatalogMock(dataset.catalog);
    const fallback = createCatalogMock(dataset.catalog);
    const catalogRepository = new ResilientAnimeCatalogRepository({
      primary,
      fallback,
    });
    dependencies.catalogRepository = catalogRepository;
    dependencies.userListRepository = new GuestUserAnimeListRepository(
      catalogRepository,
    );
    const { result } = await renderHook(() => useInfiniteUnifiedUserList(), {
      wrapper: createTestWrapper(dependencies),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.pages[0]).toMatchObject({
      items: [],
      page: 1,
      nextPage: null,
      totalCount: 0,
    });
    expect(result.current.hasNextPage).toBe(false);
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
    const invalidateCache = jest.spyOn(
      dependencies.userListRepository,
      'invalidateCache',
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
    expect(invalidateCache).toHaveBeenCalledTimes(1);
    expect(invalidateCache.mock.invocationCallOrder[0]).toBeLessThan(
      getPage.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );

    await act(async () => result.current.fetchNextPage());
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
    expect(getPage).toHaveBeenLastCalledWith({
      page: 2,
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
    queryClient.setQueryData(queryKeys.details('guest', 101), cached);
    const { result } = await renderHook(() => useUpdateProgress(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 101, episodes: 5 }));
    await waitFor(() => {
      const optimistic = queryClient.getQueryData<UnifiedAnime>(
        queryKeys.details('guest', 101),
      );
      expect(optimistic?.userEntry?.watchedEpisodes).toBe(5);
    });
    await act(async () => rejectUpdate(new Error('Mutation failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<UnifiedAnime>(queryKeys.details('guest', 101))
        ?.userEntry?.watchedEpisodes,
    ).toBe(4);
  });

  it('routes connected AniList updates directly without touching guest sync state', async () => {
    const dependencies = createTestDependencies();
    const enqueue = jest.spyOn(dependencies.syncEngine, 'enqueue');
    const queryClient = createAppQueryClient();
    const cached = buildWatchingAnime({ id: 101 });
    const guestCached = buildWatchingAnime({ id: 101, title: 'Guest copy' });
    queryClient.setQueryData(queryKeys.details('anilist:42', 101), cached);
    queryClient.setQueryData(queryKeys.details('guest', 101), guestCached);
    const updateProgress = jest
      .spyOn(dependencies.userListRepository, 'updateProgress')
      .mockResolvedValue({
        ...(cached.userEntry as UserAnimeEntry),
        watchedEpisodes: 9,
      });
    const authSession = new TestAuthSessionController();
    authSession.updateConnection('anilist', {
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
    const { result } = await renderHook(() => useUpdateProgress(), {
      wrapper: createTestWrapper(
        dependencies,
        queryClient,
        'en',
        undefined,
        authSession,
      ),
    });

    await expect(
      result.current.mutateAsync({ animeId: 101, episodes: 9 }),
    ).resolves.toMatchObject({ watchedEpisodes: 9 });
    expect(updateProgress).toHaveBeenCalledWith(101, 9);
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData<UnifiedAnime>(
        queryKeys.details('anilist:42', 101),
      )?.userEntry?.watchedEpisodes,
    ).toBe(9);
    expect(queryClient.getQueryData(queryKeys.details('guest', 101))).toEqual(
      guestCached,
    );
  });

  it('optimistically adds real membership with plan-to-watch defaults', async () => {
    const dependencies = createTestDependencies();
    const anime = dependencies.catalogRepository.getKnownById(30);
    if (!anime) throw new Error('Expected catalog anime 30.');
    const addToList = jest.spyOn(dependencies.userListRepository, 'addToList');
    const queryClient = createAppQueryClient();
    queryClient.setQueryData<UnifiedAnime>(queryKeys.details('guest', 30), {
      anime,
    });
    const { result } = await renderHook(() => useAddToList(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 30 }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<UnifiedAnime>(queryKeys.details('guest', 30))
          ?.userEntry,
      ).toMatchObject({
        animeId: 30,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(addToList).toHaveBeenCalledWith(30, undefined);
  });

  it('restores non-membership when an optimistic add fails', async () => {
    const dependencies = createTestDependencies();
    const anime = dependencies.catalogRepository.getKnownById(30);
    if (!anime) throw new Error('Expected catalog anime 30.');
    let rejectAdd: (error: Error) => void = () => undefined;
    dependencies.userListRepository.addToList = jest.fn(
      () =>
        new Promise<UserAnimeEntry>((_resolve, reject) => {
          rejectAdd = reject;
        }),
    );
    const queryClient = createAppQueryClient();
    const cached: UnifiedAnime = { anime };
    queryClient.setQueryData(queryKeys.details('guest', 30), cached);
    const { result } = await renderHook(() => useAddToList(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 30 }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<UnifiedAnime>(queryKeys.details('guest', 30))
          ?.userEntry,
      ).toBeDefined(),
    );
    await act(async () => rejectAdd(new Error('Add failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.details('guest', 30))).toEqual(
      cached,
    );
  });

  it('optimistically removes membership and keeps it removed on success', async () => {
    const dependencies = createTestDependencies();
    const queryClient = createAppQueryClient();
    queryClient.setQueryData(
      queryKeys.details('guest', 1),
      buildWatchingAnime({ id: 1 }),
    );
    const { result } = await renderHook(() => useRemoveFromList(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 1 }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<UnifiedAnime>(queryKeys.details('guest', 1))
          ?.userEntry,
      ).toBeUndefined(),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await expect(
      dependencies.userListRepository.getByAnimeId(1),
    ).resolves.toBeNull();
  });

  it('restores membership when an optimistic removal fails', async () => {
    const dependencies = createTestDependencies();
    let rejectRemoval: (error: Error) => void = () => undefined;
    dependencies.userListRepository.removeFromList = jest.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectRemoval = reject;
        }),
    );
    const queryClient = createAppQueryClient();
    const cached = buildWatchingAnime({ id: 1 });
    queryClient.setQueryData(queryKeys.details('guest', 1), cached);
    const { result } = await renderHook(() => useRemoveFromList(), {
      wrapper: createTestWrapper(dependencies, queryClient),
    });

    await act(async () => result.current.mutate({ animeId: 1 }));
    await waitFor(() =>
      expect(
        queryClient.getQueryData<UnifiedAnime>(queryKeys.details('guest', 1))
          ?.userEntry,
      ).toBeUndefined(),
    );
    await act(async () => rejectRemoval(new Error('Remove failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.details('guest', 1))).toEqual(
      cached,
    );
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
    queryClient.setQueryData(queryKeys.infiniteUserList('guest'), cached);
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
        queryKeys.infiniteUserList('guest'),
      );
      expect(optimistic?.pages[3]?.items[0]?.userEntry?.watchedEpisodes).toBe(
        8,
      );
      expect(optimistic?.pages.slice(0, 3)).toEqual(cached.pages.slice(0, 3));
    });
    await act(async () => rejectUpdate(new Error('Mutation failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData(queryKeys.infiniteUserList('guest')),
    ).toEqual(cached);
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
    >(queryKeys.infiniteUserList('guest', 'watching'));
    expect(
      cached?.pages
        .flatMap((page) => page.items)
        .some((item) => item.anime.id === animeId),
    ).toBe(false);
    expect(cached?.pages[0]?.totalCount).toBe(29);
  });

  it('rebuilds only the first active infinite page after a direct status write', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 60, status: 'watching' }),
    );
    const queryClient = createAppQueryClient();
    const authSession = new TestAuthSessionController();
    authSession.updateConnection('anilist', {
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
    const wrapper = createTestWrapper(
      dependencies,
      queryClient,
      'en',
      undefined,
      authSession,
    );
    const list = await renderHook(
      () => useInfiniteUnifiedUserList('watching'),
      { wrapper },
    );
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await act(async () => list.result.current.fetchNextPage());
    await waitFor(() =>
      expect(list.result.current.data?.pages).toHaveLength(2),
    );
    const animeId = list.result.current.data?.pages[0]?.items[0]?.anime.id;
    if (!animeId) throw new Error('Expected an item on the first page.');
    const mutation = await renderHook(() => useUpdateStatus(), { wrapper });

    await act(async () =>
      mutation.result.current.mutateAsync({ animeId, status: 'completed' }),
    );
    await waitFor(() => {
      const cached = queryClient.getQueryData<
        InfiniteData<PageResult<UnifiedAnime>, number>
      >(queryKeys.infiniteUserList('anilist:42', 'watching'));
      expect(cached?.pages).toHaveLength(1);
      expect(cached?.pages[0]?.totalCount).toBe(59);
      expect(
        cached?.pages[0]?.items.some((item) => item.anime.id === animeId),
      ).toBe(false);
    });
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
