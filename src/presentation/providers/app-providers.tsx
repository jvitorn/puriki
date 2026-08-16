import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { PropsWithChildren } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocalizationProvider } from '@/localization/localization-provider';
import { AuthSessionProvider } from '@/presentation/providers/auth-session-provider';
import { RepositoryProvider } from '@/presentation/providers/repository-provider';
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
  return (
    <GestureHandlerRootView className="flex-1">
      <SafeAreaProvider>
        <LocalizationProvider>
          <AuthSessionProvider>
            <QueryClientProvider client={queryClient}>
              <RepositoryProvider>
                <SynopsisTranslationProvider>
                  {children}
                </SynopsisTranslationProvider>
              </RepositoryProvider>
            </QueryClientProvider>
          </AuthSessionProvider>
        </LocalizationProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
