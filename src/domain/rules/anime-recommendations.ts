import type {
  AnimeCatalogItem,
  AnimeRecommendationSeed,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import {
  createAnimeTrackingContext,
  getTrackableEpisodeLimit,
} from '@/domain/rules/anime-tracking';

export interface RecommendationSeedAnime {
  anime: AnimeCatalogItem;
  seed: AnimeRecommendationSeed;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function selectRecommendationSeedEntries(
  entries: readonly UserAnimeEntry[],
  limit = 12,
): UserAnimeEntry[] {
  return entries
    .filter(
      (entry) =>
        (entry.status === 'completed' &&
          (entry.userScore === null || entry.userScore >= 7)) ||
        (entry.status === 'watching' &&
          (entry.watchedEpisodes > 0 || (entry.userScore ?? 0) >= 7)),
    )
    .sort(
      (left, right) =>
        (right.userScore ?? 0) - (left.userScore ?? 0) ||
        Number(right.status === 'completed') -
          Number(left.status === 'completed') ||
        timestamp(right.updatedAt) - timestamp(left.updatedAt),
    )
    .slice(0, Math.max(0, limit));
}

export function buildRecommendationSeeds(
  items: readonly UnifiedAnime[],
  limit = 5,
): AnimeRecommendationSeed[] {
  return items
    .flatMap((item) => {
      const entry = item.userEntry;
      if (!entry) return [];
      if (entry.status === 'completed') {
        if (entry.userScore !== null && entry.userScore < 7) return [];
        return [
          {
            animeId: item.anime.id,
            weight:
              entry.userScore === null
                ? 0.65
                : Math.min(1, 0.55 + entry.userScore * 0.045),
          },
        ];
      }
      if (entry.status !== 'watching') return [];
      if (entry.userScore !== null && entry.userScore < 7) return [];
      const episodeLimit = getTrackableEpisodeLimit(
        createAnimeTrackingContext(item.anime),
      );
      const progress =
        episodeLimit && episodeLimit > 0
          ? Math.min(1, entry.watchedEpisodes / episodeLimit)
          : 0;
      if (progress < 0.5 && (entry.userScore ?? 0) < 7) return [];
      return [
        {
          animeId: item.anime.id,
          weight: Math.min(
            0.85,
            0.4 + progress * 0.3 + (entry.userScore ?? 0) * 0.015,
          ),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.weight - left.weight || left.animeId - right.animeId,
    )
    .slice(0, Math.max(0, limit));
}

function overlapRatio(left: readonly string[], right: readonly string[]) {
  const leftSet = new Set(left.map((value) => value.toLocaleLowerCase()));
  const rightSet = new Set(right.map((value) => value.toLocaleLowerCase()));
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) return 0;
  let intersection = 0;
  leftSet.forEach((value) => {
    if (rightSet.has(value)) intersection += 1;
  });
  return intersection / union.size;
}

export function rankLocalRecommendationCandidates(
  seeds: readonly RecommendationSeedAnime[],
  candidates: readonly AnimeCatalogItem[],
  limit: number,
): AnimeCatalogItem[] {
  const seedIds = new Set(seeds.map(({ seed }) => seed.animeId));
  const uniqueCandidates = [
    ...new Map(
      candidates.map((candidate) => [candidate.id, candidate]),
    ).values(),
  ];

  return uniqueCandidates
    .filter((candidate) => !seedIds.has(candidate.id))
    .map((candidate) => {
      const affinity = seeds.reduce((best, { anime, seed }) => {
        const genreAffinity = overlapRatio(anime.genres, candidate.genres);
        const studioAffinity = overlapRatio(anime.studios, candidate.studios);
        const yearAffinity =
          anime.year !== null && candidate.year !== null
            ? Math.max(0, 1 - Math.abs(anime.year - candidate.year) / 20)
            : 0;
        return Math.max(
          best,
          seed.weight *
            (genreAffinity * 0.65 + studioAffinity * 0.2 + yearAffinity * 0.05),
        );
      }, 0);
      const quality = Math.max(0, Math.min(1, (candidate.score ?? 0) / 10));
      return { candidate, score: affinity + quality * 0.1 };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        (right.candidate.score ?? 0) - (left.candidate.score ?? 0) ||
        left.candidate.id - right.candidate.id,
    )
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
