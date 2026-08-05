import type { UnifiedAnime } from '@/domain/models/anime';
import {
  createUnifiedAnime,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';

export function buildWatchingAnime(
  overrides: Partial<UnifiedAnime['anime']> = {},
): UnifiedAnime {
  resetAnimeFactory();
  return createUnifiedAnime(
    {
      id: 101,
      title: 'Test Horizon',
      totalEpisodes: 12,
      coverSeed: 42,
      ...overrides,
    },
    { status: 'watching', watchedEpisodes: 4, userScore: 8 },
  );
}
