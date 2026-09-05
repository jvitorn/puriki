import type {
  AnimeCatalogItem,
  AnimeTrackingContext,
} from '@/domain/models/anime';

type AnimeTrackingSource = Pick<
  AnimeCatalogItem,
  'totalEpisodes' | 'releasedEpisodes' | 'airingStatus'
>;

function knownTotal(value: number | null): number | null {
  return Number.isInteger(value) && value !== null && value > 0 ? value : null;
}

function knownReleased(value: number | null): number | null {
  return Number.isInteger(value) && value !== null && value >= 0 ? value : null;
}

export function createAnimeTrackingContext(
  anime: AnimeTrackingSource,
): AnimeTrackingContext {
  return {
    totalEpisodes: anime.totalEpisodes,
    releasedEpisodes: anime.releasedEpisodes ?? null,
    airingStatus: anime.airingStatus,
  };
}

/**
 * Returns the episode ceiling Puriki can justify from provider data.
 * `null` deliberately means that no trustworthy ceiling is known, not zero.
 */
export function getTrackableEpisodeLimit(
  context: AnimeTrackingContext,
): number | null {
  const totalEpisodes = knownTotal(context.totalEpisodes);
  const releasedEpisodes = knownReleased(context.releasedEpisodes);

  switch (context.airingStatus) {
    case 'finished':
      return totalEpisodes ?? releasedEpisodes;
    case 'releasing':
    case 'hiatus':
    case 'cancelled':
      return releasedEpisodes;
    case 'not_yet_released':
      return 0;
    case 'unknown':
      return releasedEpisodes ?? totalEpisodes;
  }
}

/** Returns the best count for read-only episode metadata and progress copy. */
export function getKnownEpisodeCount(
  context: AnimeTrackingContext,
): number | null {
  return (
    knownTotal(context.totalEpisodes) ?? knownReleased(context.releasedEpisodes)
  );
}
