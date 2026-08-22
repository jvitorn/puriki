import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PropsWithChildren } from 'react';

import type {
  AuthSessionController,
  AuthSessionSnapshot,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import { queryKeys } from '@/application/queries/query-keys';
import type {
  SyncTarget,
  UserAnimeSync,
} from '@/application/sync/user-anime-sync';
import type {
  PrimaryListProviderController,
  PrimaryListProviderSnapshot,
} from '@/application/user-list/primary-list-provider-contracts';
import { DefaultPrimaryListProviderController } from '@/application/user-list/primary-list-provider-controller';
import { resolveUserListProvider } from '@/application/user-list/resolve-user-list-provider';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { PendingSyncStore } from '@/domain/repositories/pending-sync-store';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { createAniListClient } from '@/infrastructure/api/anilist/anilist-client';
import {
  createAniListDiagnosticSuite,
  type AniListDiagnosticSuite,
  type AniListRunAllResult,
} from '@/infrastructure/api/anilist/anilist-diagnostics';
import { AniListUnauthorizedError } from '@/infrastructure/api/anilist/anilist-errors';
import {
  AniListMediaIdentityRegistry,
  type AniListMediaIdentityResolver,
} from '@/infrastructure/api/anilist/anilist-media-identity';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';
import { MalAuthenticatedClient } from '@/infrastructure/api/mal/mal-authenticated-client';
import { isMalConfigured } from '@/infrastructure/api/mal/mal-config';
import { MalUnauthorizedError } from '@/infrastructure/api/mal/mal-errors';
import { ExpoMalOAuthClient } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import type { MalOAuthClientPort } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import { AniListAnimeCatalogRepository } from '@/infrastructure/repositories/anilist/anilist-anime-catalog-repository';
import { AniListUserAnimeListRepository } from '@/infrastructure/repositories/anilist/anilist-user-anime-list-repository';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { MalAnimeCatalogRepository } from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';
import { MalUserAnimeListRepository } from '@/infrastructure/repositories/mal/mal-user-anime-list-repository';
import type { CircuitState } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import {
  CATALOG_OPERATION_FAMILIES,
  type CatalogOperationFamily,
  type PrimaryCatalogHealth,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { PrimaryProviderRateLimitGate } from '@/infrastructure/repositories/resilient/primary-provider-rate-limit-gate';
import {
  ResilientAnimeCatalogRepository,
  type CatalogSuccessfulSource,
  type ResilientCatalogRuntimeSnapshot,
} from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { SessionAwareUserAnimeListRepository } from '@/infrastructure/repositories/session-aware-user-anime-list-repository';
import { primaryListProviderStorage } from '@/infrastructure/storage/primary-list-provider-storage';
import { AsyncStoragePendingSyncStore } from '@/infrastructure/sync/async-storage-pending-sync-store';
import { SyncEngine } from '@/infrastructure/sync/sync-engine';
import { UserAnimeListSyncTarget } from '@/infrastructure/sync/user-anime-list-sync-target';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { usePrimaryListProvider } from '@/presentation/providers/primary-list-provider-provider';

export interface CatalogOperationRuntimeStatus {
  circuitState: CircuitState;
  lastSuccessfulSource: CatalogSuccessfulSource | null;
  lastFallbackAt: string | null;
}

export interface CatalogRuntimeStatus {
  primaryProvider: 'anilist';
  primaryHealth: PrimaryCatalogHealth;
  primaryRateLimitedUntil: string | null;
  operations: Record<CatalogOperationFamily, CatalogOperationRuntimeStatus>;
}

export interface RepositoryDependencies {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  userListScope: string;
  canMutateUserList: boolean;
  userListUpdateMode: UserListUpdateMode;
  syncEngine: UserAnimeSync;
  getCatalogRuntimeStatus(): CatalogRuntimeStatus;
  subscribeCatalogRuntimeStatus(
    listener: (status: CatalogRuntimeStatus) => void,
  ): () => void;
  clearCatalogCache(): void;
  resetPrimaryCircuits(): void;
  runAniListDiagnostic(): Promise<AniListRunAllResult>;
}

export type UserListUpdateMode = 'queued' | 'direct' | 'unavailable';

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies?: RepositoryDependencies;
}

interface StatusChannel {
  get(): CatalogRuntimeStatus;
  update(status: CatalogRuntimeStatus): void;
  subscribe(listener: (status: CatalogRuntimeStatus) => void): () => void;
}

export interface ProductionDependenciesOptions {
  anilistRepository?: AnimeCatalogRepository;
  malRepository?: AnimeCatalogRepository;
  circuitRegistry?: CatalogCircuitBreakerRegistry;
  anilistCoordinator?: AniListRequestCoordinator;
  anilistDiagnosticSuite?: AniListDiagnosticSuite;
  malConfigured?: boolean;
  pendingSyncStore?: PendingSyncStore;
  syncTargets?: readonly SyncTarget[];
  authSession?: AuthSessionController;
  authTokenStore?: AuthTokenStore;
  anilistMediaIdentityResolver?: AniListMediaIdentityResolver;
  primaryListProvider?: PrimaryListProviderController;
  malOAuthClient?: MalOAuthClientPort;
}

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

export function userListAccessFromSnapshot(
  snapshot: AuthSessionSnapshot,
  primary: PrimaryListProviderSnapshot,
): {
  scope: string;
  canMutate: boolean;
  updateMode: UserListUpdateMode;
} {
  const resolution = resolveUserListProvider(snapshot.connections, primary);
  switch (resolution.kind) {
    case 'guest':
      return { scope: 'guest', canMutate: true, updateMode: 'queued' };
    case 'active':
      return {
        scope: `${resolution.provider}:${resolution.account.userId}`,
        canMutate: true,
        updateMode: 'direct',
      };
    case 'reconnect_required':
      return {
        scope: `reconnect-required:${resolution.providers.join(',')}`,
        canMutate: false,
        updateMode: 'unavailable',
      };
    case 'primary_required':
      return {
        scope: 'primary-required',
        canMutate: false,
        updateMode: 'unavailable',
      };
    case 'loading':
      return {
        scope: 'primary-loading',
        canMutate: false,
        updateMode: 'unavailable',
      };
  }
}

function createStatusChannel(initial: CatalogRuntimeStatus): StatusChannel {
  let status = initial;
  const listeners = new Set<(value: CatalogRuntimeStatus) => void>();
  return {
    get: () => status,
    update: (next) => {
      if (next === status) return;
      status = next;
      listeners.forEach((listener) => listener(status));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function runtimeStatusFromSnapshot(
  snapshot: ResilientCatalogRuntimeSnapshot,
): CatalogRuntimeStatus {
  return {
    primaryProvider: snapshot.primaryProvider,
    primaryHealth: snapshot.primaryHealth,
    primaryRateLimitedUntil:
      snapshot.primaryRateLimitedUntil === null
        ? null
        : new Date(snapshot.primaryRateLimitedUntil).toISOString(),
    operations: Object.fromEntries(
      CATALOG_OPERATION_FAMILIES.map((family) => {
        const operation = snapshot.operations[family];
        return [
          family,
          {
            circuitState: operation.circuitState,
            lastSuccessfulSource: operation.lastSuccessfulSource,
            lastFallbackAt:
              operation.lastFallbackAt === null
                ? null
                : new Date(operation.lastFallbackAt).toISOString(),
          },
        ];
      }),
    ) as Record<CatalogOperationFamily, CatalogOperationRuntimeStatus>,
  };
}

export function createProductionDependencies(
  options: ProductionDependenciesOptions = {},
): RepositoryDependencies {
  const malAvailable = options.malConfigured ?? isMalConfigured;
  const coordinator =
    options.anilistCoordinator ?? new AniListRequestCoordinator();
  const primaryRateLimitGate = new PrimaryProviderRateLimitGate();
  coordinator.subscribeRateLimit((retryAfterMs) =>
    primaryRateLimitGate.block(retryAfterMs),
  );
  const publicAniListClient = createAniListClient({ coordinator });
  const anilistMediaIdentityResolver =
    options.anilistMediaIdentityResolver ??
    new AniListMediaIdentityRegistry({
      client: publicAniListClient,
      maximumAttempts: 2,
    });
  const anilistRepository =
    options.anilistRepository ??
    new AniListAnimeCatalogRepository({
      client: publicAniListClient,
      maximumAttempts: 2,
      mediaIdentityResolver: anilistMediaIdentityResolver,
    });
  const malRepository =
    options.malRepository ?? new MalAnimeCatalogRepository();
  const diagnosticSuite =
    options.anilistDiagnosticSuite ??
    createAniListDiagnosticSuite({ clientOptions: { coordinator } });
  const circuitRegistry =
    options.circuitRegistry ?? new CatalogCircuitBreakerRegistry();
  let channel: StatusChannel;
  const catalogRepository = new ResilientAnimeCatalogRepository({
    primary: anilistRepository,
    fallback: malRepository,
    circuitRegistry,
    rateLimitGate: primaryRateLimitGate,
    isFallbackAvailable: () => malAvailable,
    onRuntimeStatusChange: (snapshot) =>
      channel.update(runtimeStatusFromSnapshot(snapshot)),
  });
  channel = createStatusChannel(
    runtimeStatusFromSnapshot(catalogRepository.getRuntimeSnapshot()),
  );
  const guestUserListRepository = new GuestUserAnimeListRepository(
    catalogRepository,
  );
  const malOAuthClient = options.malOAuthClient ?? new ExpoMalOAuthClient();
  const malAccessTokenProvider = async (): Promise<string> => {
    const record = await options.authTokenStore?.get('mal');
    if (!record) throw new MalUnauthorizedError(401);
    if (Date.parse(record.expiresAt) > Date.now() + 60_000) {
      return record.accessToken;
    }
    if (!record.refreshToken) throw new MalUnauthorizedError(401);
    try {
      const refreshed = await malOAuthClient.refresh(record.refreshToken);
      await options.authTokenStore?.set('mal', {
        version: 1,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: refreshed.expiresAt,
      });
      return refreshed.accessToken;
    } catch {
      throw new MalUnauthorizedError(401);
    }
  };
  const primaryListProvider =
    options.primaryListProvider ??
    new DefaultPrimaryListProviderController(primaryListProviderStorage);
  const userListRepository =
    options.authSession && options.authTokenStore
      ? new SessionAwareUserAnimeListRepository({
          session: options.authSession,
          primaryListProvider,
          guestRepository: guestUserListRepository,
          createRepository: {
            anilist: (account) =>
              new AniListUserAnimeListRepository({
                client: createAniListClient({
                  coordinator,
                  accessTokenProvider: async () => {
                    const record = await options.authTokenStore?.get('anilist');
                    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
                      throw new AniListUnauthorizedError();
                    }
                    return record.accessToken;
                  },
                }),
                userId: Number(account.userId),
                mediaIdentityResolver: anilistMediaIdentityResolver,
                onUnauthorized: () =>
                  options.authSession?.markReconnectRequired('anilist'),
              }),
            mal: () =>
              new MalUserAnimeListRepository({
                client: new MalAuthenticatedClient({
                  accessTokenProvider: malAccessTokenProvider,
                }),
                onUnauthorized: () =>
                  options.authSession?.markReconnectRequired('mal'),
              }),
          },
        })
      : guestUserListRepository;
  const syncEngine = new SyncEngine(
    options.pendingSyncStore ?? new AsyncStoragePendingSyncStore(),
    options.syncTargets ?? [
      new UserAnimeListSyncTarget(guestUserListRepository),
    ],
  );
  void syncEngine.start();
  return {
    catalogRepository,
    userListRepository,
    userListScope: 'guest',
    canMutateUserList: true,
    userListUpdateMode: 'queued',
    syncEngine,
    getCatalogRuntimeStatus: () => channel.get(),
    subscribeCatalogRuntimeStatus: (listener) => channel.subscribe(listener),
    clearCatalogCache: () => catalogRepository.clearCache(),
    resetPrimaryCircuits: () => catalogRepository.resetPrimaryCircuits(),
    runAniListDiagnostic: async () => {
      try {
        return await diagnosticSuite.runAll();
      } finally {
        channel.update(
          runtimeStatusFromSnapshot(catalogRepository.getRuntimeSnapshot()),
        );
      }
    },
  };
}

export function createDefaultDependencies(): RepositoryDependencies {
  return createProductionDependencies();
}

export function RepositoryProvider({
  children,
  dependencies,
}: RepositoryProviderProps) {
  const queryClient = useQueryClient();
  const { snapshot: authSnapshot } = useAuthSession();
  const { snapshot: primarySnapshot } = usePrimaryListProvider();
  const [source] = useState(() => dependencies ?? createDefaultDependencies());
  const userListAccess = userListAccessFromSnapshot(
    authSnapshot,
    primarySnapshot,
  );
  const previousUserListScope = useRef(userListAccess.scope);
  useEffect(() => {
    if (previousUserListScope.current === userListAccess.scope) return;
    source.userListRepository.invalidateCache();
    previousUserListScope.current = userListAccess.scope;
  }, [source.userListRepository, userListAccess.scope]);
  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...source,
      userListScope: userListAccess.scope,
      canMutateUserList: userListAccess.canMutate,
      userListUpdateMode: userListAccess.updateMode,
      clearCatalogCache: () => {
        source.clearCatalogCache();
        queryClient.removeQueries({ queryKey: queryKeys.catalogRoot });
      },
    }),
    [
      queryClient,
      source,
      userListAccess.canMutate,
      userListAccess.scope,
      userListAccess.updateMode,
    ],
  );
  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): RepositoryDependencies {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepositories must be used inside RepositoryProvider.');
  }
  return context;
}

export function useCatalogRuntimeStatus(): CatalogRuntimeStatus {
  const { getCatalogRuntimeStatus, subscribeCatalogRuntimeStatus } =
    useRepositories();
  return useSyncExternalStore(
    subscribeCatalogRuntimeStatus,
    getCatalogRuntimeStatus,
    getCatalogRuntimeStatus,
  );
}

export function useSyncStatus() {
  const { syncEngine } = useRepositories();
  const subscribe = useCallback(
    (listener: () => void) => syncEngine.subscribe(listener),
    [syncEngine],
  );
  const getSnapshot = useCallback(() => syncEngine.getStatus(), [syncEngine]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
