import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

import type { ApplicationRuntime } from '@/application/runtime/application-runtime';

interface RuntimeProviderProps extends PropsWithChildren {
  runtime: ApplicationRuntime;
}

const RuntimeContext = createContext<ApplicationRuntime | null>(null);

export function RuntimeProvider({ children, runtime }: RuntimeProviderProps) {
  return (
    <RuntimeContext.Provider value={runtime}>
      {children}
    </RuntimeContext.Provider>
  );
}

export function useApplicationRuntime(): ApplicationRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error(
      'useApplicationRuntime must be used inside RuntimeProvider.',
    );
  }
  return runtime;
}

export function useOptionalApplicationRuntime(): ApplicationRuntime | null {
  return useContext(RuntimeContext);
}
