import type { AnimeListStatus } from '@/domain/models/anime';
import {
  createAnimeCatalogItem,
  createUserAnimeEntry,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';

const GENERATED_STATUSES: readonly AnimeListStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

export function createGeneratedListDataset(
  size: number,
  { seed = 25_025, firstId = 20_001, titlePrefix = 'Test List Anime' } = {},
): MockDataset {
  resetAnimeFactory(seed);
  const catalog = Array.from({ length: size }, (_, index) => {
    const totalEpisodes = [12, 13, 24, 26, 48][index % 5] ?? 12;
    return createAnimeCatalogItem({
      id: firstId + index,
      title: `${titlePrefix} ${String(index + 1).padStart(3, '0')}`,
      totalEpisodes,
      score: 6.1 + (index % 34) / 10,
      year: 2010 + (index % 17),
    });
  });
  const userEntries = catalog.map((anime, index) => {
    const status =
      GENERATED_STATUSES[index % GENERATED_STATUSES.length] ?? 'watching';
    const watchedEpisodes =
      status === 'completed'
        ? (anime.totalEpisodes ?? 0)
        : status === 'plan_to_watch'
          ? 0
          : Math.min(
              (index * 3) % 12,
              anime.totalEpisodes ?? Number.POSITIVE_INFINITY,
            );
    return createUserAnimeEntry({
      animeId: anime.id,
      status,
      watchedEpisodes,
      userScore: index % 4 === 0 ? (index % 10) + 1 : null,
      updatedAt: new Date(Date.UTC(2026, 0, 1 + index, 12)).toISOString(),
    });
  });
  return { catalog, userEntries };
}
