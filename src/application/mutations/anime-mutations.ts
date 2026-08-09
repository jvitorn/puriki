import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

import { queryKeys } from '@/application/queries/query-keys';
import type {
  AnimeListStatus,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { applyProgress } from '@/domain/rules/anime-progress';
import { transitionStatus } from '@/domain/rules/anime-status';
import { useRepositories } from '@/presentation/providers/repository-provider';

interface CacheSnapshot {
  queryKey: QueryKey;
  data: unknown;
}

type InfiniteUnifiedList = InfiniteData<PageResult<UnifiedAnime>, number>;
type ListFilter = AnimeListStatus | 'all';

function isInfiniteUnifiedList(value: unknown): value is InfiniteUnifiedList {
  if (!value || typeof value !== 'object') return false;
  return 'pages' in value && 'pageParams' in value;
}

function getListFilter(queryKey: QueryKey): ListFilter | null {
  if (queryKey[0] !== queryKeys.userListRoot[0]) return null;
  if (queryKey[1] === 'continue-watching') return 'watching';
  if (queryKey[1] !== 'infinite') return null;
  const filter = queryKey[2];
  return filter === 'all' ? 'all' : (filter as AnimeListStatus);
}

function findUnifiedAnime(
  value: unknown,
  animeId: number,
): UnifiedAnime | undefined {
  if (isInfiniteUnifiedList(value)) {
    return value.pages
      .flatMap((page) => page.items)
      .find((item) => item.anime.id === animeId);
  }
  if (Array.isArray(value)) {
    return (value as UnifiedAnime[]).find((item) => item.anime.id === animeId);
  }
  const item = value as UnifiedAnime | null | undefined;
  return item?.anime.id === animeId ? item : undefined;
}

function replaceEntryInItems(
  items: UnifiedAnime[],
  nextEntry: UserAnimeEntry,
  filter: ListFilter,
): UnifiedAnime[] {
  if (filter !== 'all' && filter !== nextEntry.status) {
    return items.filter((item) => item.anime.id !== nextEntry.animeId);
  }
  return items.map((item) =>
    item.anime.id === nextEntry.animeId
      ? { ...item, userEntry: nextEntry }
      : item,
  );
}

function replaceCachedEntry(
  value: unknown,
  queryKey: QueryKey,
  nextEntry: UserAnimeEntry,
): unknown {
  const filter = getListFilter(queryKey);
  if (isInfiniteUnifiedList(value) && filter) {
    const containsEntry = value.pages.some((page) =>
      page.items.some((item) => item.anime.id === nextEntry.animeId),
    );
    const removesEntry =
      containsEntry && filter !== 'all' && filter !== nextEntry.status;
    return {
      ...value,
      pages: value.pages.map((page) => ({
        ...page,
        items: replaceEntryInItems(page.items, nextEntry, filter),
        totalCount:
          removesEntry && page.totalCount !== null
            ? Math.max(0, page.totalCount - 1)
            : page.totalCount,
      })),
    };
  }
  if (Array.isArray(value) && filter) {
    return replaceEntryInItems(value as UnifiedAnime[], nextEntry, filter);
  }
  const item = value as UnifiedAnime | null | undefined;
  if (item?.anime.id === nextEntry.animeId) {
    return { ...item, userEntry: nextEntry };
  }
  return value;
}

function getAnimeCacheEntries(
  queryClient: QueryClient,
  animeId: number,
): [QueryKey, unknown][] {
  return [
    ...queryClient.getQueriesData({ queryKey: queryKeys.userListRoot }),
    ...queryClient.getQueriesData({
      queryKey: queryKeys.details(animeId),
      exact: true,
    }),
  ];
}

function updateCachedEntry(
  queryClient: QueryClient,
  nextEntry: UserAnimeEntry,
): void {
  getAnimeCacheEntries(queryClient, nextEntry.animeId).forEach(
    ([queryKey, data]) => {
      queryClient.setQueryData(
        queryKey,
        replaceCachedEntry(data, queryKey, nextEntry),
      );
    },
  );
}

async function optimisticallyUpdate(
  queryClient: QueryClient,
  animeId: number,
  makeEntry: (
    current: UserAnimeEntry,
    totalEpisodes: number | null,
  ) => UserAnimeEntry,
): Promise<CacheSnapshot[]> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.userListRoot }),
    queryClient.cancelQueries({
      queryKey: queryKeys.details(animeId),
      exact: true,
    }),
  ]);
  const matching = getAnimeCacheEntries(queryClient, animeId);
  const snapshots: CacheSnapshot[] = matching.map(([queryKey, data]) => ({
    queryKey,
    data,
  }));
  matching.forEach(([queryKey, data]) => {
    const item = findUnifiedAnime(data, animeId);
    if (!item) return;
    const current =
      item.userEntry ??
      ({
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: '',
      } as const);
    const nextEntry = makeEntry(current, item.anime.totalEpisodes);
    queryClient.setQueryData(
      queryKey,
      replaceCachedEntry(data, queryKey, nextEntry),
    );
  });
  return snapshots;
}

function restoreSnapshots(
  queryClient: QueryClient,
  snapshots?: CacheSnapshot[],
): void {
  snapshots?.forEach(({ queryKey, data }) =>
    queryClient.setQueryData(queryKey, data),
  );
}

function reconcileSuccessfulMutation(
  queryClient: QueryClient,
  nextEntry: UserAnimeEntry,
): Promise<unknown[]> {
  updateCachedEntry(queryClient, nextEntry);
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListRoot,
      refetchType: 'none',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(nextEntry.animeId),
      exact: true,
      refetchType: 'none',
    }),
  ]);
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();
  const { userListRepository } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      episodes,
    }: {
      animeId: number;
      episodes: number;
    }) => userListRepository.updateProgress(animeId, episodes),
    onMutate: ({ animeId, episodes }) =>
      optimisticallyUpdate(queryClient, animeId, (current, total) =>
        applyProgress(current, episodes, total),
      ),
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry) =>
      reconcileSuccessfulMutation(queryClient, nextEntry),
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const { userListRepository } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
    }: {
      animeId: number;
      status: AnimeListStatus;
    }) => userListRepository.updateStatus(animeId, status),
    onMutate: ({ animeId, status }) =>
      optimisticallyUpdate(queryClient, animeId, (current, total) =>
        transitionStatus(current, status, total),
      ),
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry) =>
      reconcileSuccessfulMutation(queryClient, nextEntry),
  });
}

export function useUpdateScore() {
  const queryClient = useQueryClient();
  const { userListRepository } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      score,
    }: {
      animeId: number;
      score: number | null;
    }) => userListRepository.updateScore(animeId, score),
    onMutate: ({ animeId, score }) =>
      optimisticallyUpdate(queryClient, animeId, (current) => ({
        ...current,
        userScore: score,
      })),
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry) =>
      reconcileSuccessfulMutation(queryClient, nextEntry),
  });
}

export function useResetSessionData() {
  const queryClient = useQueryClient();
  const { userListRepository } = useRepositories();
  return useMutation({
    mutationFn: () => userListRepository.reset(),
    onSuccess: () =>
      Promise.all([
        queryClient.resetQueries({ queryKey: queryKeys.userListRoot }),
        queryClient.resetQueries({ queryKey: queryKeys.detailsRoot }),
      ]),
  });
}

export const useResetMockData = useResetSessionData;
