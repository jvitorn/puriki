import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PropsWithChildren } from 'react';

import { queryKeys } from '@/application/queries/query-keys';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { createAniListClient } from '@/infrastructure/api/anilist/anilist-client';
import {
  createAniListDiagnosticSuite,
  type AniListDiagnosticSuite,
  type AniListRunAllResult,
} from '@/infrastructure/api/anilist/anilist-diagnostics';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';
import { isMalConfigured } from '@/infrastructure/api/mal/mal-config';
import { AniListAnimeCatalogRepository } from '@/infrastructure/repositories/anilist/anilist-anime-catalog-repository';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { MalAnimeCatalogRepository } from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';
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
  getCatalogRuntimeStatus(): CatalogRuntimeStatus;
  subscribeCatalogRuntimeStatus(
    listener: (status: CatalogRuntimeStatus) => void,
  ): () => void;
  clearCatalogCache(): void;
  resetPrimaryCircuits(): void;
  runAniListDiagnostic(): Promise<AniListRunAllResult>;
}

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
}

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

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
  const anilistRepository =
    options.anilistRepository ??
    new AniListAnimeCatalogRepository({
      client: createAniListClient({ coordinator }),
      maximumAttempts: 2,
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
  return {
    catalogRepository,
    userListRepository: new GuestUserAnimeListRepository(catalogRepository),
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
  const [source] = useState(() => dependencies ?? createDefaultDependencies());
  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...source,
      clearCatalogCache: () => {
        source.clearCatalogCache();
        queryClient.removeQueries({ queryKey: queryKeys.catalogRoot });
      },
    }),
    [queryClient, source],
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
