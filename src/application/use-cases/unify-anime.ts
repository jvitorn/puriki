import type {
  AnimeCatalogItem,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';

export function unifyAnimeList(
  catalog: AnimeCatalogItem[],
  entries: UserAnimeEntry[],
): UnifiedAnime[] {
  const catalogById = new Map(catalog.map((anime) => [anime.id, anime]));
  return entries.flatMap((userEntry) => {
    const anime = catalogById.get(userEntry.animeId);
    return anime ? [{ anime, userEntry }] : [];
  });
}
