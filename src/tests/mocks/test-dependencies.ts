import type { MockDelayMode } from '@/domain/models/mock-behavior';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import {
  JIKAN_OPERATION_FAMILIES,
  type JikanOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { createGeneratedListDataset } from '@/mocks/factories/generated-list-dataset';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';
import type { RepositoryDependencies } from '@/presentation/providers/repository-provider';

const mockOperationStatuses = Object.fromEntries(
  JIKAN_OPERATION_FAMILIES.map((family) => [
    family,
    {
      circuitState: null,
      lastSuccessfulSource: 'mock' as const,
      lastFallbackAt: null,
    },
  ]),
) as RepositoryDependencies['catalogRuntimeStatus']['operations'] &
  Record<JikanOperationFamily, unknown>;

export function createTestDependencies(
  dataset: MockDataset = buildMockDataset(),
): RepositoryDependencies {
  const runtime = new MockRuntime(dataset);
  const dependencies: RepositoryDependencies = {
    catalogRepository: new MockAnimeCatalogRepository(runtime),
    userListRepository: new MockUserAnimeListRepository(runtime),
    mode: 'mock',
    behavior: runtime.getBehavior(),
    malConfigured: false,
    catalogRuntimeStatus: {
      mode: 'mock',
      jikanHealth: null,
      jikanRateLimitedUntil: null,
      operations: mockOperationStatuses,
    },
    subscribeCatalogRuntimeStatus: () => () => undefined,
    setDelayMode: (mode: MockDelayMode) => {
      runtime.setDelayMode(mode);
      dependencies.behavior = runtime.getBehavior();
    },
    setForceErrors: (enabled: boolean) => {
      runtime.setForceErrors(enabled);
      dependencies.behavior = runtime.getBehavior();
    },
    selectDataSourceMode: () => undefined,
    clearCatalogCache: () => dependencies.catalogRepository.clearCache(),
    clearAllCatalogCaches: () => dependencies.catalogRepository.clearCache(),
    resetJikanCircuits: () => undefined,
    refreshCurrentSample: () => dependencies.userListRepository.reset(),
    mockDevelopmentControls: {
      generateTestList: () =>
        runtime.run(() =>
          runtime.replaceDataset(createGeneratedListDataset(100)),
        ),
    },
  };
  return dependencies;
}
