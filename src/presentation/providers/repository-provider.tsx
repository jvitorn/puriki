import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import type {
  MockBehavior,
  MockDelayMode,
} from '@/domain/models/mock-behavior';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';

export interface RepositoryDependencies {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  behavior: MockBehavior;
  setDelayMode(mode: MockDelayMode): void;
  setForceErrors(enabled: boolean): void;
}

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies?: RepositoryDependencies;
}

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

export function createDefaultDependencies(): RepositoryDependencies {
  const runtime = new MockRuntime();
  const dependencies: RepositoryDependencies = {
    catalogRepository: new MockAnimeCatalogRepository(runtime),
    userListRepository: new MockUserAnimeListRepository(runtime),
    behavior: runtime.getBehavior(),
    setDelayMode: (mode) => {
      runtime.setDelayMode(mode);
      dependencies.behavior = runtime.getBehavior();
    },
    setForceErrors: (enabled) => {
      runtime.setForceErrors(enabled);
      dependencies.behavior = runtime.getBehavior();
    },
  };
  return dependencies;
}

export function RepositoryProvider({
  children,
  dependencies,
}: RepositoryProviderProps) {
  const [defaults] = useState(createDefaultDependencies);
  const source = dependencies ?? defaults;
  const [behavior, setBehavior] = useState(source.behavior);
  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...source,
      behavior,
      setDelayMode: (mode) => {
        source.setDelayMode(mode);
        setBehavior({ ...source.behavior, delayMode: mode });
      },
      setForceErrors: (enabled) => {
        source.setForceErrors(enabled);
        setBehavior({ ...source.behavior, forceErrors: enabled });
      },
    }),
    [behavior, source],
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
