import {
  createLongTitleAnime,
  createUnknownEpisodesAnime,
} from '@/mocks/factories/anime-factory';
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
      return {
        ...base,
        userEntries: base.catalog.map((anime, index) => ({
          animeId: anime.id,
          status: 'watching' as const,
          watchedEpisodes: index % 10,
          userScore: null,
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
        })),
      };
    case 'default':
    case 'loading':
    case 'error':
      return base;
  }
}
