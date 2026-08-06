import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';

import { queryKeys } from '@/application/queries/query-keys';
import type {
  AnimeListStatus,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { applyProgress } from '@/domain/rules/anime-progress';
import { transitionStatus } from '@/domain/rules/anime-status';
import { useRepositories } from '@/presentation/providers/repository-provider';

interface CacheSnapshot {
  queryKey: QueryKey;
  data: unknown;
}

function replaceEntryInUnified(
  value: UnifiedAnime[] | UnifiedAnime | null | undefined,
  nextEntry: UserAnimeEntry,
): typeof value {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item.anime.id === nextEntry.animeId
        ? { ...item, userEntry: nextEntry }
        : item,
    );
  }
  if (value?.anime.id === nextEntry.animeId)
    return { ...value, userEntry: nextEntry };
  return value;
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
    queryClient.cancelQueries({ queryKey: queryKeys.unifiedListRoot }),
    queryClient.cancelQueries({ queryKey: ['anime', 'details', animeId] }),
  ]);
  const matching = [
    ...queryClient.getQueriesData({ queryKey: queryKeys.unifiedListRoot }),
    ...queryClient.getQueriesData({ queryKey: ['anime', 'details', animeId] }),
  ];
  const snapshots: CacheSnapshot[] = matching.map(([queryKey, data]) => ({
    queryKey,
    data,
  }));
  for (const [queryKey, data] of matching) {
    const unified = data as UnifiedAnime[] | UnifiedAnime | null | undefined;
    const item = Array.isArray(unified)
      ? unified.find((candidate) => candidate.anime.id === animeId)
      : unified?.anime.id === animeId
        ? unified
        : undefined;
    if (!item) continue;
    const current =
      item.userEntry ??
      ({
        animeId,
        status: 'plan_to_watch',
        watchedEpisodes: 0,
        userScore: null,
        updatedAt: '',
      } as const);
    queryClient.setQueryData(
      queryKey,
      replaceEntryInUnified(
        unified,
        makeEntry(current, item.anime.totalEpisodes),
      ),
    );
  }
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

function invalidateAnimeState(queryClient: QueryClient): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.unifiedListRoot }),
    queryClient.invalidateQueries({ queryKey: ['anime', 'details'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.userListRoot }),
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
    onSuccess: () => invalidateAnimeState(queryClient),
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
    onSuccess: () => invalidateAnimeState(queryClient),
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
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export function useResetSessionData() {
  const queryClient = useQueryClient();
  const { userListRepository } = useRepositories();
  return useMutation({
    mutationFn: () => userListRepository.reset(),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}

export const useResetMockData = useResetSessionData;
