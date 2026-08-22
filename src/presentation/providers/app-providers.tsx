import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DefaultPrimaryListProviderController } from '@/application/user-list/primary-list-provider-controller';
import { createProductionAuthSession } from '@/infrastructure/auth/create-auth-session';
import { ExpoSecureAuthTokenStore } from '@/infrastructure/auth/expo-secure-auth-token-store';
import { primaryListProviderStorage } from '@/infrastructure/storage/primary-list-provider-storage';
import { LocalizationProvider } from '@/localization/localization-provider';
import { AuthSessionProvider } from '@/presentation/providers/auth-session-provider';
import { PrimaryListProviderProvider } from '@/presentation/providers/primary-list-provider-provider';
import {
  createProductionDependencies,
  RepositoryProvider,
} from '@/presentation/providers/repository-provider';
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
  const [runtime] = useState(() => {
    const tokenStore = new ExpoSecureAuthTokenStore();
    const authSession = createProductionAuthSession({ tokenStore });
    const primaryListProvider = new DefaultPrimaryListProviderController(
      primaryListProviderStorage,
    );
    return {
      authSession,
      primaryListProvider,
      dependencies: createProductionDependencies({
        authSession,
        authTokenStore: tokenStore,
        primaryListProvider,
      }),
    };
  });
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <LocalizationProvider>
          <AuthSessionProvider session={runtime.authSession}>
            <PrimaryListProviderProvider controller={runtime.primaryListProvider}>
              <QueryClientProvider client={queryClient}>
                <RepositoryProvider dependencies={runtime.dependencies}>
                  <SynopsisTranslationProvider>
                    {children}
                  </SynopsisTranslationProvider>
                </RepositoryProvider>
              </QueryClientProvider>
            </PrimaryListProviderProvider>
          </AuthSessionProvider>
        </LocalizationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
