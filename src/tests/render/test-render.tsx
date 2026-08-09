import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { RenderOptions } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appI18n } from '@/localization/i18n';
import type { LanguagePreference } from '@/localization/languages';
import { resolveEffectiveLanguage } from '@/localization/languages';
import { LocalizationProvider } from '@/localization/localization-provider';
import { createAppQueryClient } from '@/presentation/providers/app-providers';
import { RepositoryProvider } from '@/presentation/providers/repository-provider';
import type { RepositoryDependencies } from '@/presentation/providers/repository-provider';
import { SynopsisTranslationProvider } from '@/presentation/providers/synopsis-translation-provider';
import type { SynopsisTranslationDependencies } from '@/presentation/providers/synopsis-translation-provider';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

interface TestRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  dependencies?: RepositoryDependencies;
  queryClient?: QueryClient;
  languagePreference?: LanguagePreference;
  translationDependencies?: SynopsisTranslationDependencies;
}

export function createTestWrapper(
  dependencies?: RepositoryDependencies,
  queryClient: QueryClient = createAppQueryClient(),
  languagePreference: LanguagePreference = 'en',
  translationDependencies?: SynopsisTranslationDependencies,
) {
  const resolvedDependencies = dependencies ?? createTestDependencies();
  void appI18n.changeLanguage(
    resolveEffectiveLanguage(languagePreference, 'en-US'),
  );
  return function TestWrapper({ children }: PropsWithChildren) {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <LocalizationProvider initialPreference={languagePreference}>
          <QueryClientProvider client={queryClient}>
            <RepositoryProvider dependencies={resolvedDependencies}>
              <SynopsisTranslationProvider
                dependencies={translationDependencies}
              >
                {children}
              </SynopsisTranslationProvider>
            </RepositoryProvider>
          </QueryClientProvider>
        </LocalizationProvider>
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
    languagePreference = 'en',
    translationDependencies,
    ...renderOptions
  } = options;
  const renderResult = await render(ui, {
    wrapper: createTestWrapper(
      dependencies,
      queryClient,
      languagePreference,
      translationDependencies,
    ),
    ...renderOptions,
  });
  return {
    queryClient,
    ...renderResult,
  };
}
