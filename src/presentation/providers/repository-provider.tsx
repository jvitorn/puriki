import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { PropsWithChildren } from 'react';

import type {
  CatalogRuntimeStatus,
  RepositoryServices,
} from '@/application/runtime/application-runtime';
import { resolveUserListAccess } from '@/application/user-list/resolve-user-list-access';
import type { UserListUpdateMode } from '@/application/user-list/resolve-user-list-access';
import { useAuthSession } from '@/presentation/providers/auth-session-provider';
import { usePrimaryListProvider } from '@/presentation/providers/primary-list-provider-provider';
import { queryKeys } from '@/presentation/queries/query-keys';

export type { CatalogRuntimeStatus } from '@/application/runtime/application-runtime';
export type { UserListUpdateMode } from '@/application/user-list/resolve-user-list-access';

export interface RepositoryDependencies extends RepositoryServices {
  userListScope: string;
  canMutateUserList: boolean;
  userListUpdateMode: UserListUpdateMode;
}

interface RepositoryProviderProps extends PropsWithChildren {
  dependencies: RepositoryServices;
}

const RepositoryContext = createContext<RepositoryDependencies | null>(null);

export function RepositoryProvider({
  children,
  dependencies,
}: RepositoryProviderProps) {
  const queryClient = useQueryClient();
  const { snapshot: authSnapshot } = useAuthSession();
  const { snapshot: primarySnapshot } = usePrimaryListProvider();
  const userListAccess = resolveUserListAccess(authSnapshot, primarySnapshot);
  const previousUserListScope = useRef(userListAccess.scope);

  useEffect(() => {
    if (previousUserListScope.current === userListAccess.scope) return;
    dependencies.userListRepository.invalidateCache();
    previousUserListScope.current = userListAccess.scope;
  }, [dependencies.userListRepository, userListAccess.scope]);

  const value = useMemo<RepositoryDependencies>(
    () => ({
      ...dependencies,
      userListScope: userListAccess.scope,
      canMutateUserList: userListAccess.canMutate,
      userListUpdateMode: userListAccess.updateMode,
      clearCatalogCache: () => {
        dependencies.clearCatalogCache();
        queryClient.removeQueries({ queryKey: queryKeys.catalogRoot });
      },
    }),
    [
      dependencies,
      queryClient,
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
