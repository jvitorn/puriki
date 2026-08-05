import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { RenderOptions } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { RepositoryProvider } from '@/presentation/providers/repository-provider';
import type { RepositoryDependencies } from '@/presentation/providers/repository-provider';

interface TestRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  dependencies?: RepositoryDependencies;
  queryClient?: QueryClient;
}

export function createTestWrapper(
  dependencies?: RepositoryDependencies,
  queryClient: QueryClient = createAppQueryClient(),
) {
  return function TestWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <RepositoryProvider dependencies={dependencies}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </RepositoryProvider>
      </SafeAreaProvider>
    );
  };
}

export async function renderWithProviders(
  ui: ReactElement,
  options: TestRenderOptions = {},
) {
  const {
    dependencies,
    queryClient = createAppQueryClient(),
    ...renderOptions
  } = options;
  const renderResult = await render(ui, {
    wrapper: createTestWrapper(dependencies, queryClient),
    ...renderOptions,
  });
  return {
    queryClient,
    ...renderResult,
  };
}
