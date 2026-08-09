import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type {
  MockBehavior,
  MockDelayMode,
} from '@/domain/models/mock-behavior';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { isMalConfigured } from '@/infrastructure/api/mal/mal-config';
import { JikanAnimeCatalogRepository } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';
import { MalAnimeCatalogRepository } from '@/infrastructure/repositories/mal/mal-anime-catalog-repository';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
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
import { SessionUserAnimeListRepository } from '@/infrastructure/repositories/session/session-user-anime-list-repository';
import { createGeneratedListDataset } from '@/mocks/factories/generated-list-dataset';

export type DataSourceMode = 'automatic' | 'jikan' | 'mal' | 'mock';

export type CatalogRuntimeSource = CatalogSuccessfulSource | 'mock';

export interface CatalogOperationRuntimeStatus {
  circuitState: CircuitState | null;
  lastSuccessfulSource: CatalogRuntimeSource | null;
  lastFallbackAt: string | null;
}

export interface CatalogRuntimeStatus {
  mode: DataSourceMode;
  jikanHealth: JikanHealth | null;
  jikanRateLimitedUntil: string | null;
  operations: Record<JikanOperationFamily, CatalogOperationRuntimeStatus>;
}

export interface MockDevelopmentControls {
  generateTestList(): Promise<void>;
}

export interface RepositoryDependencies {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  mode: DataSourceMode;
  behavior: MockBehavior;
  malConfigured: boolean;
  catalogRuntimeStatus: CatalogRuntimeStatus;
  subscribeCatalogRuntimeStatus(
    listener: (status: CatalogRuntimeStatus) => void,
  ): () => void;
  setDelayMode(mode: MockDelayMode): void;
  setForceErrors(enabled: boolean): void;
  selectDataSourceMode(mode: DataSourceMode): void;
  clearCatalogCache(): void;
  clearAllCatalogCaches(): void;
  resetJikanCircuits(): void;
  refreshCurrentSample(): Promise<void>;
  mockDevelopmentControls: MockDevelopmentControls | null;
}

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies?: RepositoryDependencies;
}

interface StatusChannel {
  get(): CatalogRuntimeStatus;
  update(
    updater:
      | Partial<CatalogRuntimeStatus>
      | ((current: CatalogRuntimeStatus) => CatalogRuntimeStatus),
  ): void;
  subscribe(listener: (status: CatalogRuntimeStatus) => void): () => void;
}

export interface AutomaticDependenciesOptions {
  jikanRepository?: AnimeCatalogRepository;
  malRepository?: AnimeCatalogRepository;
  circuitRegistry?: CatalogCircuitBreakerRegistry;
  malConfigured?: boolean;
}

const INACTIVE_MOCK_BEHAVIOR: MockBehavior = {
  delayMode: 'none',
  forceErrors: false,
};

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

function createStatusChannel(initial: CatalogRuntimeStatus): StatusChannel {
  let status = initial;
  const listeners = new Set<(value: CatalogRuntimeStatus) => void>();
  return {
    get: () => status,
    update: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater(status)
          : { ...status, ...updater };
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

function createOperationStatuses(
  source: CatalogRuntimeSource | null,
  circuitState: CircuitState | null,
): Record<JikanOperationFamily, CatalogOperationRuntimeStatus> {
  return Object.fromEntries(
    JIKAN_OPERATION_FAMILIES.map((family) => [
      family,
      { circuitState, lastSuccessfulSource: source, lastFallbackAt: null },
    ]),
  ) as Record<JikanOperationFamily, CatalogOperationRuntimeStatus>;
}

function updateOperationSource(
  channel: StatusChannel,
  family: JikanOperationFamily,
  source: CatalogRuntimeSource,
): void {
  channel.update((current) => ({
    ...current,
    operations: {
      ...current.operations,
      [family]: {
        ...current.operations[family],
        lastSuccessfulSource: source,
      },
    },
  }));
}

function runtimeStatusFromSnapshot(
  snapshot: ResilientCatalogRuntimeSnapshot,
): CatalogRuntimeStatus {
  return {
    mode: 'automatic',
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

function createSourceTrackedRepository(
  repository: AnimeCatalogRepository,
  source: 'jikan' | 'mal',
  channel: StatusChannel,
): AnimeCatalogRepository {
  const track = async <T,>(
    family: JikanOperationFamily,
    operation: Promise<T>,
  ): Promise<T> => {
    const value = await operation;
    updateOperationSource(channel, family, source);
    return value;
  };
  return {
    getFeatured: () => track('featured', repository.getFeatured()),
    getPopular: () => track('popular', repository.getPopular()),
    getSeasonal: () => track('seasonal', repository.getSeasonal()),
    getUpcoming: () => track('upcoming', repository.getUpcoming()),
    search: (query) => track('search', repository.search(query)),
    getManyByIds: (ids) => track('details', repository.getManyByIds(ids)),
    getDetailsById: (id) => track('details', repository.getDetailsById(id)),
    clearCache: () => repository.clearCache(),
  };
}

function createLiveDependencies(
  mode: Exclude<DataSourceMode, 'mock'>,
  catalogRepository: AnimeCatalogRepository,
  refreshCatalog: () => Promise<void>,
  channel: StatusChannel,
  malConfigured: boolean,
  resetJikanCircuits: () => void = () => undefined,
): RepositoryDependencies {
  const userListRepository = new SessionUserAnimeListRepository(
    catalogRepository,
  );
  return {
    catalogRepository,
    userListRepository,
    mode,
    behavior: INACTIVE_MOCK_BEHAVIOR,
    malConfigured,
    get catalogRuntimeStatus() {
      return channel.get();
    },
    subscribeCatalogRuntimeStatus: (listener) => channel.subscribe(listener),
    setDelayMode: () => undefined,
    setForceErrors: () => undefined,
    selectDataSourceMode: () => undefined,
    clearCatalogCache: () => catalogRepository.clearCache(),
    clearAllCatalogCaches: () => catalogRepository.clearCache(),
    resetJikanCircuits,
    refreshCurrentSample: async () => {
      await refreshCatalog();
      await userListRepository.generateNewSample();
    },
    mockDevelopmentControls: null,
  };
}

export function createMockDependencies(): RepositoryDependencies {
  const runtime = new MockRuntime();
  const catalogRepository = new MockAnimeCatalogRepository(runtime);
  const userListRepository = new MockUserAnimeListRepository(runtime);
  const channel = createStatusChannel({
    mode: 'mock',
    jikanHealth: null,
    jikanRateLimitedUntil: null,
    operations: createOperationStatuses('mock', null),
  });
  const dependencies: RepositoryDependencies = {
    catalogRepository,
    userListRepository,
    mode: 'mock',
    behavior: runtime.getBehavior(),
    malConfigured: isMalConfigured,
    get catalogRuntimeStatus() {
      return channel.get();
    },
    subscribeCatalogRuntimeStatus: (listener) => channel.subscribe(listener),
    setDelayMode: (mode) => {
      runtime.setDelayMode(mode);
      dependencies.behavior = runtime.getBehavior();
    },
    setForceErrors: (enabled) => {
      runtime.setForceErrors(enabled);
      dependencies.behavior = runtime.getBehavior();
    },
    selectDataSourceMode: () => undefined,
    clearCatalogCache: () => catalogRepository.clearCache(),
    clearAllCatalogCaches: () => catalogRepository.clearCache(),
    resetJikanCircuits: () => undefined,
    refreshCurrentSample: () => userListRepository.reset(),
    mockDevelopmentControls: {
      generateTestList: () =>
        runtime.run(() =>
          runtime.replaceDataset(createGeneratedListDataset(100)),
        ),
    },
  };
  return dependencies;
}

export function createJikanDependencies(): RepositoryDependencies {
  const jikanRepository = new JikanAnimeCatalogRepository();
  const channel = createStatusChannel({
    mode: 'jikan',
    jikanHealth: null,
    jikanRateLimitedUntil: null,
    operations: createOperationStatuses(null, null),
  });
  const catalogRepository = createSourceTrackedRepository(
    jikanRepository,
    'jikan',
    channel,
  );
  return createLiveDependencies(
    'jikan',
    catalogRepository,
    async () => {
      await jikanRepository.refresh();
      (['popular', 'seasonal', 'upcoming'] as const).forEach((family) =>
        updateOperationSource(channel, family, 'jikan'),
      );
    },
    channel,
    isMalConfigured,
  );
}

export function createMalDependencies(): RepositoryDependencies {
  const malRepository = new MalAnimeCatalogRepository();
  const channel = createStatusChannel({
    mode: 'mal',
    jikanHealth: null,
    jikanRateLimitedUntil: null,
    operations: createOperationStatuses(null, null),
  });
  const catalogRepository = createSourceTrackedRepository(
    malRepository,
    'mal',
    channel,
  );
  return createLiveDependencies(
    'mal',
    catalogRepository,
    async () => {
      await malRepository.refresh();
      (['popular', 'seasonal', 'upcoming'] as const).forEach((family) =>
        updateOperationSource(channel, family, 'mal'),
      );
    },
    channel,
    isMalConfigured,
  );
}

export function createAutomaticDependencies(
  options: AutomaticDependenciesOptions = {},
): RepositoryDependencies {
  const malAvailable = options.malConfigured ?? isMalConfigured;
  const jikanRepository =
    options.jikanRepository ??
    new JikanAnimeCatalogRepository({ maximumAttempts: 2 });
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
  return createLiveDependencies(
    'automatic',
    catalogRepository,
    () => catalogRepository.refresh(),
    channel,
    malAvailable,
    () => catalogRepository.resetCircuits(),
  );
}

export function createDefaultDependencies(
  mode: DataSourceMode = process.env.NODE_ENV === 'test' ? 'mock' : 'automatic',
): RepositoryDependencies {
  if (mode === 'automatic') return createAutomaticDependencies();
  if (mode === 'jikan') return createJikanDependencies();
  if (mode === 'mal') return createMalDependencies();
  return createMockDependencies();
}

export function RepositoryProvider({
  children,
  dependencies,
}: RepositoryProviderProps) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState(
    () => dependencies ?? createDefaultDependencies(),
  );
  const [behavior, setBehavior] = useState(source.behavior);
  const [runtimeStatus, setRuntimeStatus] = useState(
    source.catalogRuntimeStatus,
  );

  useEffect(() => {
    return source.subscribeCatalogRuntimeStatus(setRuntimeStatus);
  }, [source]);

  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...source,
      behavior,
      catalogRuntimeStatus: runtimeStatus,
      setDelayMode: (mode) => {
        if (source.mode !== 'mock') return;
        source.setDelayMode(mode);
        setBehavior({ ...source.behavior });
      },
      setForceErrors: (enabled) => {
        if (source.mode !== 'mock') return;
        source.setForceErrors(enabled);
        setBehavior({ ...source.behavior });
      },
      selectDataSourceMode: (mode) => {
        if (mode === source.mode) return;
        const next = createDefaultDependencies(mode);
        queryClient.clear();
        setSource(next);
        setBehavior(next.behavior);
        setRuntimeStatus(next.catalogRuntimeStatus);
      },
      clearCatalogCache: () => {
        source.clearCatalogCache();
        queryClient.clear();
      },
      clearAllCatalogCaches: () => {
        source.clearAllCatalogCaches();
        queryClient.clear();
      },
      refreshCurrentSample: async () => {
        await source.refreshCurrentSample();
        queryClient.clear();
      },
    }),
    [behavior, queryClient, runtimeStatus, source],
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
