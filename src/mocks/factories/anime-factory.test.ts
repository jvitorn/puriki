import {
  createAnimeCatalogItem,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';
import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';

describe('anime factories', () => {
  it('honors controlled overrides', () => {
    const anime = createAnimeCatalogItem({
      title: 'Exact Title',
      totalEpisodes: 24,
    });
    expect(anime).toMatchObject({ title: 'Exact Title', totalEpisodes: 24 });
  });

  it('generates deterministic Faker output', () => {
    resetAnimeFactory(123);
    const first = createAnimeCatalogItem();
    resetAnimeFactory(123);
    const second = createAnimeCatalogItem();
    expect(second).toEqual(first);
  });

  it('builds a convincing stable default dataset', () => {
    expect(buildMockDataset()).toEqual(buildMockDataset());
    expect(buildMockDataset().catalog).toHaveLength(50);
    expect(buildMockDataset().userEntries).toHaveLength(25);
  });

  it('provides required edge scenarios', () => {
    expect(createMockScenario('empty')).toEqual({
      catalog: [],
      userEntries: [],
    });
    expect(
      createMockScenario('long-titles').catalog[0]?.title.length,
    ).toBeGreaterThan(50);
    expect(
      createMockScenario('unknown-episodes').catalog[0]?.totalEpisodes,
    ).toBeNull();
    expect(
      createMockScenario('watching-only').userEntries.every(
        (entry) => entry.status === 'watching',
      ),
    ).toBe(true);
    expect(
      createMockScenario('completed-only').userEntries.every(
        (entry) => entry.status === 'completed',
      ),
    ).toBe(true);
    expect(createMockScenario('large-list').userEntries).toHaveLength(50);
    expect(createMockScenario('loading').catalog).toHaveLength(50);
    expect(createMockScenario('error').catalog).toHaveLength(50);
  });
});
