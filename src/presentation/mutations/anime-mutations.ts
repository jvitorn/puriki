import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LatestProgressIntentCoordinator } from '@/application/mutations/latest-progress-intent';
import { RepositoryError } from '@/domain/errors/domain-error';
import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';
import { applyProgress } from '@/domain/rules/anime-progress';
import { transitionStatus } from '@/domain/rules/anime-status';
import { useRepositories } from '@/presentation/providers/repository-provider';
import { queryKeys } from '@/presentation/queries/query-keys';

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
    anime: AnimeCatalogItem,
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
    const nextEntry = makeEntry(item.userEntry, item.anime);
    queryClient.setQueryData(
      queryKey,
      replaceCachedEntry(data, queryKey, nextEntry),
    );
  });
  return snapshots;
}

function trackingContext(anime: AnimeCatalogItem) {
  return {
    totalEpisodes: anime.totalEpisodes ?? anime.releasedEpisodes ?? null,
    airingStatus: anime.airingStatus,
  };
}

function findCachedUnifiedAnime(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
): UnifiedAnime | undefined {
  for (const [, data] of getAnimeCacheEntries(
    queryClient,
    userListScope,
    animeId,
  )) {
    const item = findUnifiedAnime(data, animeId);
    if (item) return item;
  }
  return undefined;
}

function ensureAllowedStatusMutation(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
  status: AnimeListStatus,
): void {
  const item = findCachedUnifiedAnime(queryClient, userListScope, animeId);
  if (!item?.userEntry) return;
  const transition = transitionStatus(
    item.userEntry,
    status,
    trackingContext(item.anime),
  );
  if (!transition.allowed) {
    throw new RepositoryError(
      `Status transition blocked: ${transition.reason}.`,
    );
  }
}

function restoreSnapshots(
  queryClient: QueryClient,
  snapshots?: CacheSnapshot[],
): void {
  snapshots?.forEach(({ queryKey, data }) =>
    queryClient.setQueryData(queryKey, data),
  );
}

function resetInfiniteUserListPages(
  queryClient: QueryClient,
  userListScope: string,
): void {
  queryClient.setQueriesData(
    { queryKey: queryKeys.userListScope(userListScope) },
    (current) =>
      isInfiniteUnifiedList(current)
        ? {
            ...current,
            pages: current.pages.slice(0, 1),
            pageParams: current.pageParams.slice(0, 1),
          }
        : current,
  );
}

function reconcileDirectMutation(
  queryClient: QueryClient,
  userListScope: string,
  nextEntry: UserAnimeEntry,
): Promise<unknown[]> {
  updateCachedEntry(queryClient, userListScope, nextEntry);
  resetInfiniteUserListPages(queryClient, userListScope);
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListScope(userListScope),
      refetchType: 'active',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(userListScope, nextEntry.animeId),
      exact: true,
      refetchType: 'none',
    }),
  ]);
}

function reconcileMembershipChange(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
): Promise<unknown[]> {
  resetInfiniteUserListPages(queryClient, userListScope);
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListScope(userListScope),
      refetchType: 'active',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(userListScope, animeId),
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

function reconcileProgressFailure(
  queryClient: QueryClient,
  userListScope: string,
  animeId: number,
  invalidateRepository: () => void,
): Promise<unknown[]> {
  invalidateRepository();
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: queryKeys.userListScope(userListScope),
      refetchType: 'active',
    }),
    queryClient.invalidateQueries({
      queryKey: queryKeys.details(userListScope, animeId),
      exact: true,
      refetchType: 'active',
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
        const transition = transitionStatus(
          base,
          status,
          trackingContext(current.anime),
        );
        if (transition.allowed) {
          setDetailsMembership(
            queryClient,
            userListScope,
            animeId,
            transition.entry,
          );
        }
      }
      return snapshots;
    },
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry) =>
      reconcileDirectMutation(queryClient, userListScope, nextEntry),
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
      return reconcileMembershipChange(queryClient, userListScope, animeId);
    },
  });
}

export function useUpdateProgress() {
  const queryClient = useQueryClient();
  const {
    canMutateUserList,
    syncEngine,
    userListRepository,
    userListScope,
    userListUpdateMode,
  } = useRepositories();
  const coordinator = useMemo(
    () => new LatestProgressIntentCoordinator(userListRepository),
    [userListRepository],
  );
  const versions = useRef(new Map<number, number>());
  const failedIntent = useRef<{ animeId: number; episodes: number } | null>(
    null,
  );
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const mutation = useMutation({
    retry: false,
    mutationFn: ({
      animeId,
      episodes,
    }: {
      animeId: number;
      episodes: number;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      if (userListUpdateMode === 'direct') {
        return coordinator.submit(animeId, episodes);
      }
      if (userListUpdateMode === 'queued') {
        return syncEngine
          .enqueue({ animeId, type: 'SET_PROGRESS', value: episodes })
          .then(() => null);
      }
      throw readOnlyMutationError();
    },
    onMutate: async ({ animeId, episodes }) => {
      const version = (versions.current.get(animeId) ?? 0) + 1;
      versions.current.set(animeId, version);
      failedIntent.current = null;
      if (savedTimer.current) clearTimeout(savedTimer.current);
      setSaveState('saving');
      const snapshots = canMutateUserList
        ? await optimisticallyUpdate(
            queryClient,
            userListScope,
            animeId,
            (current, anime) =>
              applyProgress(current, episodes, trackingContext(anime)),
          )
        : [];
      return { snapshots, version, mode: userListUpdateMode };
    },
    onError: (_error, variables, context) => {
      if (
        !context ||
        context.version !== versions.current.get(variables.animeId)
      )
        return;
      failedIntent.current = variables;
      setSaveState('error');
      if (context.mode === 'direct') {
        return reconcileProgressFailure(
          queryClient,
          userListScope,
          variables.animeId,
          () => userListRepository.invalidateCache(),
        );
      }
      restoreSnapshots(queryClient, context.snapshots);
    },
    onSuccess: (nextEntry, variables, context) => {
      if (
        !context ||
        context.version !== versions.current.get(variables.animeId)
      )
        return;
      failedIntent.current = null;
      setSaveState('saved');
      savedTimer.current = setTimeout(() => setSaveState('idle'), 1_000);
      return nextEntry
        ? reconcileDirectMutation(queryClient, userListScope, nextEntry)
        : invalidateMembershipCaches(
            queryClient,
            userListScope,
            variables.animeId,
          );
    },
  });

  return {
    ...mutation,
    saveState,
    retryLastIntent: () => {
      const intent = failedIntent.current;
      if (intent) mutation.mutate(intent);
    },
  };
}

export function useUpdateStatus() {
  const queryClient = useQueryClient();
  const {
    canMutateUserList,
    syncEngine,
    userListRepository,
    userListScope,
    userListUpdateMode,
  } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      status,
    }: {
      animeId: number;
      status: AnimeListStatus;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      ensureAllowedStatusMutation(queryClient, userListScope, animeId, status);
      if (userListUpdateMode === 'direct') {
        return userListRepository.updateStatus(animeId, status);
      }
      if (userListUpdateMode === 'queued') {
        return syncEngine
          .enqueue({ animeId, type: 'SET_STATUS', value: status })
          .then(() => null);
      }
      throw readOnlyMutationError();
    },
    onMutate: ({ animeId, status }) => {
      if (!canMutateUserList) return [];
      ensureAllowedStatusMutation(queryClient, userListScope, animeId, status);
      return optimisticallyUpdate(
        queryClient,
        userListScope,
        animeId,
        (current, anime) => {
          const transition = transitionStatus(
            current,
            status,
            trackingContext(anime),
          );
          return transition.allowed ? transition.entry : current;
        },
      );
    },
    onError: (_error, _variables, snapshots) =>
      restoreSnapshots(queryClient, snapshots),
    onSuccess: (nextEntry, { animeId }) =>
      nextEntry
        ? reconcileDirectMutation(queryClient, userListScope, nextEntry)
        : invalidateMembershipCaches(queryClient, userListScope, animeId),
  });
}

export function useUpdateScore() {
  const queryClient = useQueryClient();
  const {
    canMutateUserList,
    syncEngine,
    userListRepository,
    userListScope,
    userListUpdateMode,
  } = useRepositories();
  return useMutation({
    mutationFn: ({
      animeId,
      score,
    }: {
      animeId: number;
      score: number | null;
    }) => {
      if (!canMutateUserList) throw readOnlyMutationError();
      if (userListUpdateMode === 'direct') {
        return userListRepository.updateScore(animeId, score);
      }
      if (userListUpdateMode === 'queued') {
        return syncEngine
          .enqueue({ animeId, type: 'SET_SCORE', value: score })
          .then(() => null);
      }
      throw readOnlyMutationError();
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
    onSuccess: (nextEntry, { animeId }) =>
      nextEntry
        ? reconcileDirectMutation(queryClient, userListScope, nextEntry)
        : invalidateMembershipCaches(queryClient, userListScope, animeId),
  });
}
