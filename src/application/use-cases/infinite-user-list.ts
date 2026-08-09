import type { UnifiedAnime } from '@/domain/models/anime';
import type { PageResult } from '@/domain/models/pagination';

export function flattenUniqueAnimePages(
  pages: readonly PageResult<UnifiedAnime>[] | undefined,
): UnifiedAnime[] {
  const seen = new Set<number>();
  return (pages ?? []).flatMap((page) =>
    page.items.filter((item) => {
      if (seen.has(item.anime.id)) return false;
      seen.add(item.anime.id);
      return true;
    }),
  );
}
