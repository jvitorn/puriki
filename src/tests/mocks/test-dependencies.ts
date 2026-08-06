import type { MockDelayMode } from '@/domain/models/mock-behavior';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';
import type { RepositoryDependencies } from '@/presentation/providers/repository-provider';

export function createTestDependencies(
  dataset: MockDataset = buildMockDataset(),
): RepositoryDependencies {
  const runtime = new MockRuntime(dataset);
  const dependencies: RepositoryDependencies = {
    catalogRepository: new MockAnimeCatalogRepository(runtime),
    userListRepository: new MockUserAnimeListRepository(runtime),
    mode: 'mock',
    behavior: runtime.getBehavior(),
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
    refreshCurrentSample: () => dependencies.userListRepository.reset(),
  };
  return dependencies;
}
