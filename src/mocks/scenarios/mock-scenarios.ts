import {
  createLongTitleAnime,
  createUnknownEpisodesAnime,
} from '@/mocks/factories/anime-factory';
import { createGeneratedListDataset } from '@/mocks/factories/generated-list-dataset';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';

export type MockScenarioName =
  | 'default'
  | 'empty'
  | 'loading'
  | 'error'
  | 'long-titles'
  | 'unknown-episodes'
  | 'watching-only'
  | 'completed-only'
  | 'large-list';

function createLargeListScenario(): MockDataset {
  return createGeneratedListDataset(250, { titlePrefix: 'Large List Anime' });
}

export function createMockScenario(name: MockScenarioName): MockDataset {
  const base = buildMockDataset();
  switch (name) {
    case 'empty':
      return { catalog: [], userEntries: [] };
    case 'long-titles':
      return { catalog: [createLongTitleAnime()], userEntries: [] };
    case 'unknown-episodes':
      return { catalog: [createUnknownEpisodesAnime()], userEntries: [] };
    case 'watching-only':
      return {
        ...base,
        userEntries: base.userEntries.filter(
          (entry) => entry.status === 'watching',
        ),
      };
    case 'completed-only':
      return {
        ...base,
        userEntries: base.userEntries.filter(
          (entry) => entry.status === 'completed',
        ),
      };
    case 'large-list':
      return createLargeListScenario();
    case 'default':
    case 'loading':
    case 'error':
      return base;
  }
}
