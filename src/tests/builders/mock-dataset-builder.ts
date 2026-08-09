import type { AnimeListStatus } from '@/domain/models/anime';
import {
  createAnimeCatalogItem,
  createUserAnimeEntry,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';
import type { MockDataset } from '@/mocks/fixtures/mock-dataset';
import { ANIME_STATUSES } from '@/shared/constants/anime-status';

export function buildUserListDataset({
  size,
  status,
}: {
  size: number;
  status?: AnimeListStatus;
}): MockDataset {
  resetAnimeFactory(7_777);
  const catalog = Array.from({ length: size }, (_, index) =>
    createAnimeCatalogItem({
      id: 10_001 + index,
      title: `Generated Anime ${index + 1}`,
      totalEpisodes: 12,
    }),
  );
  const userEntries = catalog.map((anime, index) =>
    createUserAnimeEntry({
      animeId: anime.id,
      status:
        status ?? ANIME_STATUSES[index % ANIME_STATUSES.length] ?? 'watching',
      watchedEpisodes: index % 12,
    }),
  );
  return { catalog, userEntries };
}
