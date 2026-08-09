import { RepositoryError } from '@/domain/errors/domain-error';
import type {
  MockBehavior,
  MockBehaviorController,
  MockDelayMode,
} from '@/domain/models/mock-behavior';
import {
  NORMAL_MOCK_DELAY_MS,
  SLOW_MOCK_DELAY_MS,
} from '@/mocks/config/mock-config';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';
import { initialMockDataset } from '@/mocks/fixtures/mock-dataset';

function cloneDataset(dataset: MockDataset): MockDataset {
  return {
    catalog: dataset.catalog.map((anime) => ({
      ...anime,
      alternativeTitles: [...anime.alternativeTitles],
      genres: [...anime.genres],
      studios: [...anime.studios],
    })),
    userEntries: dataset.userEntries.map((entry) => ({ ...entry })),
  };
}

export class MockRuntime implements MockBehaviorController {
  private behavior: MockBehavior = { delayMode: 'none', forceErrors: false };
  private readonly originalDataset: MockDataset;
  private dataset: MockDataset;

  constructor(dataset: MockDataset = initialMockDataset) {
    this.originalDataset = cloneDataset(dataset);
    this.dataset = cloneDataset(dataset);
  }

  getBehavior(): MockBehavior {
    return { ...this.behavior };
  }

  setDelayMode(mode: MockDelayMode): void {
    this.behavior.delayMode = mode;
  }

  setForceErrors(enabled: boolean): void {
    this.behavior.forceErrors = enabled;
  }

  getDataset(): MockDataset {
    return this.dataset;
  }

  resetDataset(): void {
    this.dataset = cloneDataset(this.originalDataset);
  }

  replaceDataset(dataset: MockDataset): void {
    this.dataset = cloneDataset(dataset);
  }

  async run<T>(operation: () => T): Promise<T> {
    const delay =
      this.behavior.delayMode === 'slow'
        ? SLOW_MOCK_DELAY_MS
        : this.behavior.delayMode === 'normal'
          ? NORMAL_MOCK_DELAY_MS
          : 0;
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    if (this.behavior.forceErrors) throw new RepositoryError();
    return operation();
  }
}
