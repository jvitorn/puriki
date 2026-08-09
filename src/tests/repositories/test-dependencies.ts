import { CATALOG_OPERATION_FAMILIES } from '@/infrastructure/repositories/resilient/catalog-operation-family';
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
    primaryProvider: 'anilist',
    primaryHealth: 'healthy',
    primaryRateLimitedUntil: null,
    operations: Object.fromEntries(
      CATALOG_OPERATION_FAMILIES.map((family) => [
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
    resetPrimaryCircuits: () => undefined,
    runAniListDiagnostic: async () => ({
      results: [],
      summary: {
        passed: 0,
        total: 0,
        averageLatencyMs: 0,
        slowestTest: null,
        totalResponseBytes: 0,
        requestsMade: 0,
        startingRemaining: null,
        endingRemaining: null,
        rateLimitResponses: 0,
        stoppedByRateLimit: false,
      },
    }),
  };
}
