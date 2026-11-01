import type {
  AnimeCatalogItem,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';

export function selectPersonalizedPopularAnime(
  candidates: readonly AnimeCatalogItem[],
  userEntries: readonly UserAnimeEntry[],
): UnifiedAnime[] {
  const entriesByAnimeId = new Map(
    userEntries.map((entry) => [entry.animeId, entry]),
  );

  return candidates.flatMap((anime) => {
    const userEntry = entriesByAnimeId.get(anime.id);
    if (userEntry?.status === 'completed') return [];
    return [{ anime, userEntry }];
  });
}
