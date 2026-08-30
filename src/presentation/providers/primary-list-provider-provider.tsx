import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PropsWithChildren } from 'react';

import type {
  PrimaryListProviderController,
  PrimaryListProviderSnapshot,
} from '@/application/user-list/primary-list-provider-contracts';
import type { AuthProviderId } from '@/domain/models/auth';

export interface PrimaryListProviderContextValue {
  snapshot: PrimaryListProviderSnapshot;
  select(provider: AuthProviderId): Promise<void>;
  clear(): Promise<void>;
}

interface PrimaryListProviderProviderProps extends PropsWithChildren {
  controller: PrimaryListProviderController;
}

const PrimaryListProviderContext =
  createContext<PrimaryListProviderContextValue | null>(null);

export function PrimaryListProviderProvider({
  children,
  controller,
}: PrimaryListProviderProviderProps) {
  const [instance] = useState(() => controller);
  const snapshot = useSyncExternalStore(
    instance.subscribe,
    instance.getSnapshot,
    instance.getSnapshot,
  );

  useEffect(() => {
    void instance.hydrate();
  }, [instance]);

  const value = useMemo<PrimaryListProviderContextValue>(
    () => ({
      snapshot,
      select: instance.select.bind(instance),
      clear: instance.clear.bind(instance),
    }),
    [instance, snapshot],
  );

  return (
    <PrimaryListProviderContext.Provider value={value}>
      {children}
    </PrimaryListProviderContext.Provider>
  );
}

export function usePrimaryListProvider(): PrimaryListProviderContextValue {
  const context = useContext(PrimaryListProviderContext);
  if (!context) {
    throw new Error(
      'usePrimaryListProvider must be used inside PrimaryListProviderProvider.',
    );
  }
  return context;
}
