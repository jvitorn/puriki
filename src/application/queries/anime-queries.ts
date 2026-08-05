import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/application/queries/query-keys';
import { unifyAnimeList } from '@/application/use-cases/unify-anime';
import type { AnimeListStatus, UnifiedAnime } from '@/domain/models/anime';
import { useRepositories } from '@/presentation/providers/repository-provider';

export function useFeaturedAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.featured,
    queryFn: () => catalogRepository.getFeatured(),
  });
}

export function usePopularAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.popular,
    queryFn: () => catalogRepository.getPopular(),
  });
}

export function useSeasonalAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.seasonal,
    queryFn: () => catalogRepository.getSeasonal(),
  });
}

export function useRecentlyAddedAnime() {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.recent,
    queryFn: () => catalogRepository.getRecentlyAdded(),
  });
}

export function useAnimeSearch(query: string) {
  const { catalogRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.search(query),
    queryFn: () => catalogRepository.search(query),
  });
}

export function useAnimeDetails(id: number) {
  const { catalogRepository, userListRepository } = useRepositories();
  return useQuery({
    queryKey: queryKeys.details(id),
    queryFn: async (): Promise<UnifiedAnime | null> => {
      const [anime, userEntry] = await Promise.all([
        catalogRepository.getById(id),
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
      const catalog = await Promise.all(
        entries.map((entry) => catalogRepository.getById(entry.animeId)),
      );
      return unifyAnimeList(
        catalog.filter((anime) => anime !== null),
        entries,
      );
    },
  });
}

export function useContinueWatching() {
  return useUnifiedUserList('watching');
}
