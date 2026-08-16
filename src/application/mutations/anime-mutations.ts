import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';

import { queryKeys } from '@/application/queries/query-keys';
import { RepositoryError } from '@/domain/errors/domain-error';
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
  if (queryKey[2] === 'continue-watching') return 'watching';
  if (queryKey[2] !== 'infinite') return null;
  const filter = queryKey[3];
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
  userListScope: string,
  animeId: number,
): [QueryKey, unknown][] {
  return [
    ...queryClient.getQueriesData({
      queryKey: queryKeys.userListScope(userListScope),
    }),
    ...queryClient.getQueriesData({
      queryKey: queryKeys.details(userListScope, animeId),
      exact: true,
    }),
  ];
}

function updateCachedEntry(
  queryClient: QueryClient,
  userListScope: string,
  nextEntry: UserAnimeEntry,
): void {
  getAnimeCacheEntries(queryClient, userListScope, nextEntry.animeId).forEach(
    ([queryKey, data]) => {
      queryClient.setQueryData(
        queryKey,
        replaceCachedEntry(data, queryKey, nextEntry),
      );
    },
  );
}

async function snapshotMembershipCaches(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
): Promise<CacheSnapshot[]> {
  await Promise.all([
    queryClient.cancelQueries({
      queryKey: queryKeys.userListScope(userListScope),
    }),
    queryClient.cancelQueries({
      queryKey: queryKeys.details(userListScope, animeId),
      exact: true,
    }),
  ]);
  return getAnimeCacheEntries(queryClient, userListScope, animeId).map(
    ([queryKey, data]) => ({ queryKey, data }),
  );
}

function setDetailsMembership(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
  userEntry: UserAnimeEntry | undefined,
): void {
  queryClient.setQueryData<UnifiedAnime | null>(
    queryKeys.details(userListScope, animeId),
    (current) => (current ? { ...current, userEntry } : current),
  );
}

async function optimisticallyUpdate(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
  makeEntry: (
    current: UserAnimeEntry,
    totalEpisodes: number | null,
  ) => UserAnimeEntry,
): Promise<CacheSnapshot[]> {
  const snapshots = await snapshotMembershipCaches(
    queryClient,
    userListScope,
    animeId,
  );
  const matching = getAnimeCacheEntries(queryClient, userListScope, animeId);
  matching.forEach(([queryKey, data]) => {
    const item = findUnifiedAnime(data, animeId);
    if (!item?.userEntry) return;
    const nextEntry = makeEntry(item.userEntry, item.anime.totalEpisodes);
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
  userListScope: string,
  nextEntry: UserAnimeEntry,
): Promise<unknown[]> {
  updateCachedEntry(queryClient, userListScope, nextEntry);
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListScope(userListScope),
      refetchType: 'none',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(userListScope, nextEntry.animeId),
      exact: true,
      refetchType: 'none',
    }),
  ]);
}

function invalidateMembershipCaches(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
): Promise<unknown[]> {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListScope(userListScope),
      refetchType: 'none',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(userListScope, animeId),
      exact: true,
      refetchType: 'none',
    }),
  ]);
}

function readOnlyMutationError(): RepositoryError {
  return new RepositoryError('The active anime list is read-only.');
}

export function useAddToList() {
  const queryClient = useQueryClient();
  const { canMutateUserList, userListRepository, userListScope } =
    useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
    }: {
      animeId: number;
      status?: AnimeListStatus;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      return userListRepository.addToList(animeId, status);
    },
    onMutate: async ({ animeId, status = 'plan_to_watch' }) => {
      if (!canMutateUserList) return [];
      const snapshots = await snapshotMembershipCaches(
        queryClient,
        userListScope,
        animeId,
      );
      const current = queryClient.getQueryData<UnifiedAnime | null>(
        queryKeys.details(userListScope, animeId),
      );
      if (current && !current.userEntry) {
        const base: UserAnimeEntry = {
          animeId,
          status: 'plan_to_watch',
          watchedEpisodes: 0,
          userScore: null,
          updatedAt: '',
        };
        setDetailsMembership(
          queryClient,
          userListScope,
          animeId,
          transitionStatus(base, status, current.anime.totalEpisodes),
        );
      }
      return snapshots;
    },
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry) =>
      reconcileSuccessfulMutation(queryClient, userListScope, nextEntry),
  });
}

export function useRemoveFromList() {
  const queryClient = useQueryClient();
  const { canMutateUserList, userListRepository, userListScope } =
    useRepositories();
  return useMutation({
    mutationFn: ({ animeId }: { animeId: number }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      return userListRepository.removeFromList(animeId);
    },
    onMutate: async ({ animeId }) => {
      if (!canMutateUserList) return [];
      const snapshots = await snapshotMembershipCaches(
        queryClient,
        userListScope,
        animeId,
      );
      setDetailsMembership(queryClient, userListScope, animeId, undefined);
      return snapshots;
    },
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (_value, { animeId }) => {
      setDetailsMembership(queryClient, userListScope, animeId, undefined);
      return invalidateMembershipCaches(queryClient, userListScope, animeId);
    },
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();
  const { canMutateUserList, syncEngine, userListScope } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      episodes,
    }: {
      animeId: number;
      episodes: number;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      return syncEngine.enqueue({
        animeId,
        type: 'SET_PROGRESS',
        value: episodes,
      });
    },
    onMutate: ({ animeId, episodes }) =>
      canMutateUserList
        ? optimisticallyUpdate(
            queryClient,
            userListScope,
            animeId,
            (current, total) => applyProgress(current, episodes, total),
          )
        : [],
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (_value, { animeId }) =>
      invalidateMembershipCaches(queryClient, userListScope, animeId),
  });
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const { canMutateUserList, syncEngine, userListScope } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
    }: {
      animeId: number;
      status: AnimeListStatus;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      return syncEngine.enqueue({ animeId, type: 'SET_STATUS', value: status });
    },
    onMutate: ({ animeId, status }) =>
      canMutateUserList
        ? optimisticallyUpdate(
            queryClient,
            userListScope,
            animeId,
            (current, total) => transitionStatus(current, status, total),
          )
        : [],
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (_value, { animeId }) =>
      invalidateMembershipCaches(queryClient, userListScope, animeId),
  });
}

export function useUpdateScore() {
  const queryClient = useQueryClient();
  const { canMutateUserList, syncEngine, userListScope } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      score,
    }: {
      animeId: number;
      score: number | null;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      return syncEngine.enqueue({ animeId, type: 'SET_SCORE', value: score });
    },
    onMutate: ({ animeId, score }) =>
      canMutateUserList
        ? optimisticallyUpdate(
            queryClient,
            userListScope,
            animeId,
            (current) => ({ ...current, userScore: score }),
          )
        : [],
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (_value, { animeId }) =>
      invalidateMembershipCaches(queryClient, userListScope, animeId),
  });
}
