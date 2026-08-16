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
  AuthSessionController,
  AuthSessionSnapshot,
} from '@/application/auth/auth-contracts';
import type { AuthProviderId } from '@/domain/models/auth';
import { createProductionAuthSession } from '@/infrastructure/auth/create-auth-session';

export interface AuthSessionContextValue {
  snapshot: AuthSessionSnapshot;
  signIn(provider: AuthProviderId): Promise<void>;
  retry(provider: AuthProviderId): Promise<void>;
  signOut(provider: AuthProviderId): Promise<void>;
  markReconnectRequired(provider: AuthProviderId): Promise<void>;
}

interface AuthSessionProviderProps extends PropsWithChildren {
  session?: AuthSessionController;
}

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
  session,
}: AuthSessionProviderProps) {
  const [controller] = useState(() => session ?? createProductionAuthSession());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      snapshot,
      signIn: controller.signIn,
      retry: controller.retry,
      signOut: controller.signOut,
      markReconnectRequired: controller.markReconnectRequired,
    }),
    [controller, snapshot],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function AuthSessionBootGate({ children }: PropsWithChildren) {
  const { snapshot } = useAuthSession();
  return snapshot.phase === 'ready' ? children : null;
}

export function useAuthSession(): AuthSessionContextValue {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used inside AuthSessionProvider.');
  }
  return context;
}
