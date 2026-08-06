import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type {
  MockBehavior,
  MockDelayMode,
} from '@/domain/models/mock-behavior';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { JikanAnimeCatalogRepository } from '@/infrastructure/repositories/jikan/jikan-anime-catalog-repository';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import { SessionUserAnimeListRepository } from '@/infrastructure/repositories/session/session-user-anime-list-repository';

export type DataSourceMode = 'jikan' | 'mock';

export interface RepositoryDependencies {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  mode: DataSourceMode;
  behavior: MockBehavior;
  setDelayMode(mode: MockDelayMode): void;
  setForceErrors(enabled: boolean): void;
  selectDataSourceMode(mode: DataSourceMode): void;
  clearCatalogCache(): void;
  refreshCurrentSample(): Promise<void>;
}

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies?: RepositoryDependencies;
}

const INACTIVE_MOCK_BEHAVIOR: MockBehavior = {
  delayMode: 'none',
  forceErrors: false,
};

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

export function createMockDependencies(): RepositoryDependencies {
  const runtime = new MockRuntime();
  const catalogRepository = new MockAnimeCatalogRepository(runtime);
  const userListRepository = new MockUserAnimeListRepository(runtime);
  const dependencies: RepositoryDependencies = {
    catalogRepository,
    userListRepository,
    mode: 'mock',
    behavior: runtime.getBehavior(),
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
    refreshCurrentSample: () => userListRepository.reset(),
  };
  return dependencies;
}

export function createJikanDependencies(): RepositoryDependencies {
  const catalogRepository = new JikanAnimeCatalogRepository();
  const userListRepository = new SessionUserAnimeListRepository(
    catalogRepository,
  );
  return {
    catalogRepository,
    userListRepository,
    mode: 'jikan',
    behavior: INACTIVE_MOCK_BEHAVIOR,
    setDelayMode: () => undefined,
    setForceErrors: () => undefined,
    selectDataSourceMode: () => undefined,
    clearCatalogCache: () => catalogRepository.clearCache(),
    refreshCurrentSample: async () => {
      await catalogRepository.refresh();
      await userListRepository.generateNewSample();
    },
  };
}

export function createDefaultDependencies(
  mode: DataSourceMode = process.env.NODE_ENV === 'test' ? 'mock' : 'jikan',
): RepositoryDependencies {
  return mode === 'jikan'
    ? createJikanDependencies()
    : createMockDependencies();
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
  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...source,
      behavior,
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
      },
      clearCatalogCache: () => {
        source.clearCatalogCache();
        queryClient.clear();
      },
      refreshCurrentSample: async () => {
        await source.refreshCurrentSample();
        queryClient.clear();
      },
    }),
    [behavior, queryClient, source],
  );
  return (
    <RepositoryContext.Provider value={value}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): RepositoryDependencies {
  const context = useContext(RepositoryContext);
  if (!context)
    throw new Error('useRepositories must be used inside RepositoryProvider.');
  return context;
}
