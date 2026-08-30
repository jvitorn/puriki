import type {
  AuthSessionController,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import type {
  ApplicationRuntime,
  CatalogRuntimeStatus,
  RepositoryServices,
} from '@/application/runtime/application-runtime';
import { CATALOG_OPERATION_FAMILIES } from '@/application/runtime/application-runtime';
import type { SyncTarget } from '@/application/sync/user-anime-sync';
import type { PrimaryListProviderController } from '@/application/user-list/primary-list-provider-contracts';
import { DefaultPrimaryListProviderController } from '@/application/user-list/primary-list-provider-controller';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { PendingSyncStore } from '@/domain/repositories/pending-sync-store';
import { createAniListClient } from '@/infrastructure/api/anilist/anilist-client';
import {
  createAniListDiagnosticSuite,
  type AniListDiagnosticSuite,
} from '@/infrastructure/api/anilist/anilist-diagnostics';
import { AniListUnauthorizedError } from '@/infrastructure/api/anilist/anilist-errors';
import {
  AniListMediaIdentityRegistry,
  type AniListMediaIdentityResolver,
} from '@/infrastructure/api/anilist/anilist-media-identity';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';
import { MalAuthenticatedClient } from '@/infrastructure/api/mal/mal-authenticated-client';
import { isMalConfigured } from '@/infrastructure/api/mal/mal-config';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import { MalUnauthorizedError } from '@/infrastructure/api/mal/mal-errors';
import { createProductionAuthSession } from '@/infrastructure/auth/create-auth-session';
import { ExpoSecureAuthTokenStore } from '@/infrastructure/auth/expo-secure-auth-token-store';
import { ExpoMalOAuthClient } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import type { MalOAuthClientPort } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import { AniListAnimeCatalogRepository } from '@/infrastructure/repositories/anilist/anilist-anime-catalog-repository';
import { AniListUserAnimeListRepository } from '@/infrastructure/repositories/anilist/anilist-user-anime-list-repository';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { MalAnimeCatalogRepository } from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';
import { MalUserAnimeListRepository } from '@/infrastructure/repositories/mal/mal-user-anime-list-repository';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import { PrimaryProviderRateLimitGate } from '@/infrastructure/repositories/resilient/primary-provider-rate-limit-gate';
import {
  ResilientAnimeCatalogRepository,
  type ResilientCatalogRuntimeSnapshot,
} from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { SessionAwareUserAnimeListRepository } from '@/infrastructure/repositories/session-aware-user-anime-list-repository';
import { developerSettingsStorage } from '@/infrastructure/storage/developer-settings-storage';
import { onboardingStorage } from '@/infrastructure/storage/onboarding-storage';
import { primaryListProviderStorage } from '@/infrastructure/storage/primary-list-provider-storage';
import { AsyncStoragePendingSyncStore } from '@/infrastructure/sync/async-storage-pending-sync-store';
import { SyncEngine } from '@/infrastructure/sync/sync-engine';
import { UserAnimeListSyncTarget } from '@/infrastructure/sync/user-anime-list-sync-target';
import { AsyncStorageSynopsisTranslationCache } from '@/infrastructure/translation/async-storage-synopsis-translation-cache';
import { MlKitSynopsisTranslator } from '@/infrastructure/translation/ml-kit-synopsis-translator';

interface StatusChannel {
  get(): CatalogRuntimeStatus;
  update(status: CatalogRuntimeStatus): void;
  subscribe(listener: (status: CatalogRuntimeStatus) => void): () => void;
}

export interface ProductionRepositoryServicesOptions {
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
    ) as CatalogRuntimeStatus['operations'],
  };
}

function createMalAccessTokenProvider(options: {
  tokenStore: AuthTokenStore;
  oauthClient: MalOAuthClientPort;
}): () => Promise<string> {
  return async () => {
    const record = await options.tokenStore.get('mal');
    if (!record) throw new MalUnauthorizedError(401);
    if (Date.parse(record.expiresAt) > Date.now() + 60_000) {
      return record.accessToken;
    }
    if (!record.refreshToken) throw new MalUnauthorizedError(401);
    try {
      const refreshed = await options.oauthClient.refresh(record.refreshToken);
      await options.tokenStore.set('mal', {
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
}

export function createProductionRepositoryServices(
  options: ProductionRepositoryServicesOptions = {},
): RepositoryServices {
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
  const primaryListProvider =
    options.primaryListProvider ??
    new DefaultPrimaryListProviderController(primaryListProviderStorage);
  const tokenStore = options.authTokenStore;
  const malOAuthClient = options.malOAuthClient ?? new ExpoMalOAuthClient();
  const userListRepository =
    options.authSession && tokenStore
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
                    const record = await tokenStore.get('anilist');
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
                  accessTokenProvider: createMalAccessTokenProvider({
                    tokenStore,
                    oauthClient: malOAuthClient,
                  }),
                }),
                catalogRepository,
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
    runMalDiagnostic: () => runMalConnectivityDiagnostic(),
  };
}

export function createProductionApplicationRuntime(): ApplicationRuntime {
  const authTokenStore = new ExpoSecureAuthTokenStore();
  const authSession = createProductionAuthSession({
    tokenStore: authTokenStore,
  });
  const primaryListProvider = new DefaultPrimaryListProviderController(
    primaryListProviderStorage,
  );
  return {
    authSession,
    primaryListProvider,
    repositories: createProductionRepositoryServices({
      authSession,
      authTokenStore,
      primaryListProvider,
    }),
    onboardingStore: onboardingStorage,
    developerSettingsStore: developerSettingsStorage,
    synopsisTranslation: {
      translator: new MlKitSynopsisTranslator(),
      cache: new AsyncStorageSynopsisTranslationCache(),
    },
  };
}
