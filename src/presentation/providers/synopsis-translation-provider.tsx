import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

import type { SynopsisTranslationCache } from '@/domain/repositories/synopsis-translation-cache';
import type { SynopsisTranslator } from '@/domain/services/synopsis-translator';
import { AsyncStorageSynopsisTranslationCache } from '@/infrastructure/translation/async-storage-synopsis-translation-cache';
import { MlKitSynopsisTranslator } from '@/infrastructure/translation/ml-kit-synopsis-translator';

export interface SynopsisTranslationDependencies {
  translator: SynopsisTranslator;
  cache: SynopsisTranslationCache;
}

interface SynopsisTranslationProviderProps extends PropsWithChildren {
  dependencies?: SynopsisTranslationDependencies;
}

const defaultDependencies: SynopsisTranslationDependencies = {
  translator: new MlKitSynopsisTranslator(),
  cache: new AsyncStorageSynopsisTranslationCache(),
};

const SynopsisTranslationContext =
  createContext<SynopsisTranslationDependencies | null>(null);

export function SynopsisTranslationProvider({
  children,
  dependencies = defaultDependencies,
}: SynopsisTranslationProviderProps) {
  return (
    <SynopsisTranslationContext.Provider value={dependencies}>
      {children}
    </SynopsisTranslationContext.Provider>
  );
}

export function useSynopsisTranslationDependencies(): SynopsisTranslationDependencies {
  const dependencies = useContext(SynopsisTranslationContext);
  if (!dependencies) {
    throw new Error(
      'useSynopsisTranslationDependencies must be used inside SynopsisTranslationProvider.',
    );
  }
  return dependencies;
}
