import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createProductionApplicationRuntime } from '@/infrastructure/composition/create-production-runtime';
import { LocalizationProvider } from '@/localization/localization-provider';
import { AuthSessionProvider } from '@/presentation/providers/auth-session-provider';
import { PrimaryListProviderProvider } from '@/presentation/providers/primary-list-provider-provider';
import { RepositoryProvider } from '@/presentation/providers/repository-provider';
import { RuntimeProvider } from '@/presentation/providers/runtime-provider';
import { SynopsisTranslationProvider } from '@/presentation/providers/synopsis-translation-provider';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
        gcTime: process.env.NODE_ENV === 'test' ? Infinity : 5 * 60_000,
      },
      mutations: {
        retry: false,
        gcTime: process.env.NODE_ENV === 'test' ? Infinity : 5 * 60_000,
      },
    },
  });
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createAppQueryClient);
  const [runtime] = useState(createProductionApplicationRuntime);
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <RuntimeProvider runtime={runtime}>
          <LocalizationProvider>
            <AuthSessionProvider session={runtime.authSession}>
              <PrimaryListProviderProvider
                controller={runtime.primaryListProvider}
              >
                <QueryClientProvider client={queryClient}>
                  <RepositoryProvider dependencies={runtime.repositories}>
                    <SynopsisTranslationProvider
                      dependencies={runtime.synopsisTranslation}
                    >
                      {children}
                    </SynopsisTranslationProvider>
                  </RepositoryProvider>
                </QueryClientProvider>
              </PrimaryListProviderProvider>
            </AuthSessionProvider>
          </LocalizationProvider>
        </RuntimeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
