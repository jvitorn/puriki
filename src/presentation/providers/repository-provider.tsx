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
import {
  runJikanConnectivityDiagnostic,
  type JikanServiceDiagnosticResult,
} from '@/infrastructure/api/jikan/jikan-diagnostics';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import { isMalConfigured } from '@/infrastructure/api/mal/mal-config';
import { GuestUserAnimeListRepository } from '@/infrastructure/repositories/guest/guest-user-anime-list-repository';
import { JikanAnimeCatalogRepository } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';
import { MalAnimeCatalogRepository } from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';
import type { CircuitState } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import {
  JIKAN_OPERATION_FAMILIES,
  type JikanHealth,
  type JikanOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import type {
  CatalogSuccessfulSource,
  ResilientCatalogRuntimeSnapshot,
} from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';

export interface CatalogOperationRuntimeStatus {
  circuitState: CircuitState;
  lastSuccessfulSource: CatalogSuccessfulSource | null;
  lastFallbackAt: string | null;
}

export interface CatalogRuntimeStatus {
  jikanHealth: JikanHealth;
  jikanRateLimitedUntil: string | null;
  operations: Record<JikanOperationFamily, CatalogOperationRuntimeStatus>;
}

export interface RepositoryDependencies {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  getCatalogRuntimeStatus(): CatalogRuntimeStatus;
  subscribeCatalogRuntimeStatus(
    listener: (status: CatalogRuntimeStatus) => void,
  ): () => void;
  clearCatalogCache(): void;
  resetJikanCircuits(): void;
  runJikanDiagnostic(): Promise<JikanServiceDiagnosticResult>;
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
  jikanRepository?: AnimeCatalogRepository;
  malRepository?: AnimeCatalogRepository;
  circuitRegistry?: CatalogCircuitBreakerRegistry;
  jikanScheduler?: JikanRequestScheduler;
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
    jikanHealth: snapshot.jikanHealth,
    jikanRateLimitedUntil:
      snapshot.jikanRateLimitedUntil === null
        ? null
        : new Date(snapshot.jikanRateLimitedUntil).toISOString(),
    operations: Object.fromEntries(
      JIKAN_OPERATION_FAMILIES.map((family) => {
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
    ) as Record<JikanOperationFamily, CatalogOperationRuntimeStatus>,
  };
}

export function createProductionDependencies(
  options: ProductionDependenciesOptions = {},
): RepositoryDependencies {
  const malAvailable = options.malConfigured ?? isMalConfigured;
  const jikanScheduler = options.jikanScheduler ?? new JikanRequestScheduler();
  const jikanRepository =
    options.jikanRepository ??
    new JikanAnimeCatalogRepository({
      maximumAttempts: 2,
      scheduler: jikanScheduler,
    });
  const malRepository =
    options.malRepository ?? new MalAnimeCatalogRepository();
  const circuitRegistry =
    options.circuitRegistry ?? new CatalogCircuitBreakerRegistry();
  let channel: StatusChannel;
  const catalogRepository = new ResilientAnimeCatalogRepository({
    primary: jikanRepository,
    fallback: malRepository,
    circuitRegistry,
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
    resetJikanCircuits: () => catalogRepository.resetCircuits(),
    runJikanDiagnostic: () =>
      runJikanConnectivityDiagnostic({ scheduler: jikanScheduler }),
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
