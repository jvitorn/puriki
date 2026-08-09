import {
  createAnimeCatalogItem,
  createLongTitleAnime,
  createUnknownEpisodesAnime,
  createUserAnimeEntry,
  resetAnimeFactory,
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

function createLargeListScenario(): MockDataset {
  resetAnimeFactory(25_025);
  const catalog = Array.from({ length: 250 }, (_, index) =>
    createAnimeCatalogItem({
      id: 20_001 + index,
      title: `Large List Anime ${index + 1}`,
    }),
  );
  const userEntries = catalog.map((anime, index) =>
    createUserAnimeEntry({
      animeId: anime.id,
      status: 'watching',
      watchedEpisodes: index % 10,
    }),
  );
  return { catalog, userEntries };
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
