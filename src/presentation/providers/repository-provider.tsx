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
import { CatalogCircuitBreaker } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import type { CircuitState } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { ResilientAnimeCatalogRepository } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import type { CatalogSuccessfulSource } from '@/infrastructure/repositories/resilient/resilient-anime-catalog-repository';
import { SessionUserAnimeListRepository } from '@/infrastructure/repositories/session/session-user-anime-list-repository';

export type DataSourceMode = 'automatic' | 'jikan' | 'mal' | 'mock';

export interface CatalogRuntimeStatus {
  mode: DataSourceMode;
  lastSuccessfulSource: 'jikan' | 'mal' | 'cache' | 'mock' | null;
  jikanCircuitState: CircuitState | null;
  lastFallbackAt: string | null;
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
  refreshCurrentSample(): Promise<void>;
}

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies?: RepositoryDependencies;
}

interface StatusChannel {
  get(): CatalogRuntimeStatus;
  update(patch: Partial<CatalogRuntimeStatus>): void;
  subscribe(listener: (status: CatalogRuntimeStatus) => void): () => void;
}

export interface AutomaticDependenciesOptions {
  jikanRepository?: AnimeCatalogRepository;
  malRepository?: AnimeCatalogRepository;
  circuitBreaker?: CatalogCircuitBreaker;
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
    update: (patch) => {
      const next = { ...status, ...patch };
      if (
        next.mode === status.mode &&
        next.lastSuccessfulSource === status.lastSuccessfulSource &&
        next.jikanCircuitState === status.jikanCircuitState &&
        next.lastFallbackAt === status.lastFallbackAt
      ) {
        return;
      }
      status = next;
      listeners.forEach((listener) => listener(status));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function createSourceTrackedRepository(
  repository: AnimeCatalogRepository,
  source: 'jikan' | 'mal',
  channel: StatusChannel,
): AnimeCatalogRepository {
  const track = async <T,>(operation: Promise<T>): Promise<T> => {
    const value = await operation;
    channel.update({ lastSuccessfulSource: source });
    return value;
  };
  return {
    getFeatured: () => track(repository.getFeatured()),
    getPopular: () => track(repository.getPopular()),
    getSeasonal: () => track(repository.getSeasonal()),
    getUpcoming: () => track(repository.getUpcoming()),
    search: (query) => track(repository.search(query)),
    getManyByIds: (ids) => track(repository.getManyByIds(ids)),
    getDetailsById: (id) => track(repository.getDetailsById(id)),
    clearCache: () => repository.clearCache(),
  };
}

function createLiveDependencies(
  mode: Exclude<DataSourceMode, 'mock'>,
  catalogRepository: AnimeCatalogRepository,
  refreshCatalog: () => Promise<void>,
  channel: StatusChannel,
  malConfigured: boolean,
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
    refreshCurrentSample: async () => {
      await refreshCatalog();
      await userListRepository.generateNewSample();
    },
  };
}

export function createMockDependencies(): RepositoryDependencies {
  const runtime = new MockRuntime();
  const catalogRepository = new MockAnimeCatalogRepository(runtime);
  const userListRepository = new MockUserAnimeListRepository(runtime);
  const channel = createStatusChannel({
    mode: 'mock',
    lastSuccessfulSource: 'mock',
    jikanCircuitState: null,
    lastFallbackAt: null,
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
    refreshCurrentSample: () => userListRepository.reset(),
  };
  return dependencies;
}

export function createJikanDependencies(): RepositoryDependencies {
  const jikanRepository = new JikanAnimeCatalogRepository();
  const channel = createStatusChannel({
    mode: 'jikan',
    lastSuccessfulSource: null,
    jikanCircuitState: null,
    lastFallbackAt: null,
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
      channel.update({ lastSuccessfulSource: 'jikan' });
    },
    channel,
    isMalConfigured,
  );
}

export function createMalDependencies(): RepositoryDependencies {
  const malRepository = new MalAnimeCatalogRepository();
  const channel = createStatusChannel({
    mode: 'mal',
    lastSuccessfulSource: null,
    jikanCircuitState: null,
    lastFallbackAt: null,
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
      channel.update({ lastSuccessfulSource: 'mal' });
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
  const circuitBreaker = options.circuitBreaker ?? new CatalogCircuitBreaker();
  const channel = createStatusChannel({
    mode: 'automatic',
    lastSuccessfulSource: null,
    jikanCircuitState: circuitBreaker.getState(),
    lastFallbackAt: null,
  });
  const sourceUsed = (source: CatalogSuccessfulSource) => {
    const current = channel.get();
    channel.update({
      lastSuccessfulSource: source,
      jikanCircuitState: circuitBreaker.getState(),
      ...(source === 'mal' && current.lastSuccessfulSource !== 'mal'
        ? { lastFallbackAt: new Date().toISOString() }
        : {}),
    });
  };
  const catalogRepository = new ResilientAnimeCatalogRepository({
    primary: jikanRepository,
    fallback: malRepository,
    circuitBreaker,
    isFallbackAvailable: () => malAvailable,
    onSourceUsed: sourceUsed,
    onCircuitStateChange: (jikanCircuitState) =>
      channel.update({ jikanCircuitState }),
  });
  return createLiveDependencies(
    'automatic',
    catalogRepository,
    () => catalogRepository.refresh(),
    channel,
    malAvailable,
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
