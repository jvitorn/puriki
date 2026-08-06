import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/application/queries/query-keys';
import { unifyAnimeList } from '@/application/use-cases/unify-anime';
import type { AnimeListStatus, UnifiedAnime } from '@/domain/models/anime';
import { useRepositories } from '@/presentation/providers/repository-provider';
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
  const { catalogRepository, userListRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.details(id),
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

export function useUserAnimeEntries(status?: AnimeListStatus) {
  const { userListRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.userList(status),
    queryFn: () =>
      status
        ? userListRepository.getByStatus(status)
        : userListRepository.getAll(),
  });
}

export function useUnifiedUserList(status?: AnimeListStatus) {
  const { catalogRepository, userListRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.unifiedList(status),
    queryFn: async (): Promise<UnifiedAnime[]> => {
      const entries = status
        ? await userListRepository.getByStatus(status)
        : await userListRepository.getAll();
      const catalog = await catalogRepository.getManyByIds(
        entries.map((entry) => entry.animeId),
      );
      return unifyAnimeList(catalog, entries);
    },
  });
}

export function useContinueWatching() {
  return useUnifiedUserList('watching');
}
