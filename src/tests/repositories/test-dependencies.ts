import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';
import { JIKAN_OPERATION_FAMILIES } from '@/infrastructure/repositories/resilient/catalog-operation-family';
import type {
  CatalogRuntimeStatus,
  RepositoryDependencies,
} from '@/presentation/providers/repository-provider';
import {
  buildTestAnimeDataset,
  type TestAnimeDataset,
} from '@/tests/fixtures/anime-dataset';
import {
  InMemoryAnimeCatalogRepository,
  InMemoryUserAnimeListRepository,
} from '@/tests/repositories/in-memory-anime-repositories';

export interface TestRepositoryDependencies extends RepositoryDependencies {
  emitCatalogRuntimeStatus(status: CatalogRuntimeStatus): void;
}

function defaultRuntimeStatus(): CatalogRuntimeStatus {
  return {
    jikanHealth: 'healthy',
    jikanRateLimitedUntil: null,
    operations: Object.fromEntries(
      JIKAN_OPERATION_FAMILIES.map((family) => [
        family,
        {
          circuitState: 'closed' as const,
          lastSuccessfulSource: null,
          lastFallbackAt: null,
        },
      ]),
    ) as CatalogRuntimeStatus['operations'],
  };
}

export function createTestDependencies(
  dataset: TestAnimeDataset = buildTestAnimeDataset(),
): TestRepositoryDependencies {
  let runtimeStatus = defaultRuntimeStatus();
  const listeners = new Set<(status: CatalogRuntimeStatus) => void>();
  const catalogRepository = new InMemoryAnimeCatalogRepository(dataset);
  return {
    catalogRepository,
    userListRepository: new InMemoryUserAnimeListRepository(dataset),
    getCatalogRuntimeStatus: () => runtimeStatus,
    subscribeCatalogRuntimeStatus: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emitCatalogRuntimeStatus: (status) => {
      runtimeStatus = status;
      listeners.forEach((listener) => listener(status));
    },
    clearCatalogCache: () => catalogRepository.clearCache(),
    resetJikanCircuits: () => undefined,
    runJikanDiagnostic: () => runJikanConnectivityDiagnostic(),
  };
}
