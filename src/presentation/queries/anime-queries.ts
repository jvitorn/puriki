import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import { useCallback } from 'react';

import { unifyAnimeList } from '@/application/use-cases/unify-anime';
import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UnifiedAnime,
} from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { useRepositories } from '@/presentation/providers/repository-provider';
import { queryKeys } from '@/presentation/queries/query-keys';
import {
  CONTINUE_WATCHING_LIMIT,
  USER_LIST_PAGE_SIZE,
} from '@/shared/constants/user-list';
import { normalizeSearchText } from '@/shared/utils/search';

const CATALOG_STALE_TIME = 30 * 60_000;

export function useFeaturedAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.featured,
    queryFn: () => catalogRepository.getFeatured(),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function usePopularAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.popular,
    queryFn: () => catalogRepository.getPopular(),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useSeasonalAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.seasonal,
    queryFn: () => catalogRepository.getSeasonal(),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useUpcomingAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.upcoming,
    queryFn: () => catalogRepository.getUpcoming(),
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useAnimeSearch(query: string) {
  const { catalogRepository } = useRepositories();
  const normalizedQuery = normalizeSearchText(query);
  const isRemoteSearch = normalizedQuery.length >= 2;
  return useQuery({
    queryKey: isRemoteSearch
      ? queryKeys.search(normalizedQuery)
      : queryKeys.popular,
    queryFn: () =>
      isRemoteSearch
        ? catalogRepository.search(normalizedQuery)
        : catalogRepository.getPopular(),
    placeholderData: keepPreviousData,
    staleTime: CATALOG_STALE_TIME,
  });
}

export function useAnimeDetails(id: number) {
  const { catalogRepository, userListRepository, userListScope } =
    useRepositories();
  return useQuery({
    queryKey: queryKeys.details(userListScope, id),
    queryFn: async (): Promise<UnifiedAnime | null> => {
      const [anime, userEntry] = await Promise.all([
        catalogRepository.getDetailsById(id),
        userListRepository.getByAnimeId(id),
      ]);
      return anime ? { anime, userEntry: userEntry ?? undefined } : null;
    },
    enabled: Number.isInteger(id) && id > 0,
  });
}

export function useKnownAnimeByIds(
  ids: readonly number[],
): ReadonlyMap<number, AnimeCatalogItem> {
  const { catalogRepository } = useRepositories();
  const known = new Map<number, AnimeCatalogItem>();
  [...new Set(ids)].forEach((id) => {
    const item = catalogRepository.getKnownById(id);
    if (item) known.set(id, item);
  });
  return known;
}

export function useInfiniteUnifiedUserList(status?: AnimeListStatus) {
  const { catalogRepository, userListRepository, userListScope } =
    useRepositories();
  const queryClient = useQueryClient();
  const queryKey = queryKeys.infiniteUserList(userListScope, status);
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }): Promise<PageResult<UnifiedAnime>> => {
      const entryPage = await userListRepository.getPage({
        status,
        page: pageParam,
        pageSize: USER_LIST_PAGE_SIZE,
      });
      const catalog = await catalogRepository.getManyByIds(
        entryPage.items.map((entry) => entry.animeId),
      );
      return {
        ...entryPage,
        items: unifyAnimeList(catalog, entryPage.items),
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage ?? undefined,
  });

  const refreshFromStart = useCallback(async () => {
    userListRepository.invalidateCache();
    await queryClient.cancelQueries({ queryKey, exact: true });
    queryClient.setQueryData<InfiniteData<PageResult<UnifiedAnime>, number>>(
      queryKey,
      (current) =>
        current
          ? {
              pages: current.pages.slice(0, 1),
              pageParams: current.pageParams.slice(0, 1),
            }
          : current,
    );
    return query.refetch();
  }, [query, queryClient, queryKey, userListRepository]);

  return { ...query, refreshFromStart };
}

export function useContinueWatching() {
  const { catalogRepository, userListRepository, userListScope } =
    useRepositories();
  return useQuery({
    queryKey: queryKeys.continueWatching(userListScope),
    queryFn: async (): Promise<UnifiedAnime[]> => {
      const entryPage = await userListRepository.getPage({
        status: 'watching',
        page: 1,
        pageSize: CONTINUE_WATCHING_LIMIT,
      });
      const catalog = await catalogRepository.getManyByIds(
        entryPage.items.map((entry) => entry.animeId),
      );
      return unifyAnimeList(catalog, entryPage.items);
    },
  });
}
