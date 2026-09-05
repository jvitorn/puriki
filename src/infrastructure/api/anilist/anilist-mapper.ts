import type {
  AnimeAiringStatus,
  AnimeCatalogItem,
  AnimeContinuityKind,
  AnimeContinuityRelation,
  AnimeStreamingService,
} from '@/domain/models/anime';
import type {
  AniListMediaDetails,
  AniListMediaSummary,
  AniListMediaTitle,
} from '@/infrastructure/api/anilist/anilist-dtos';
import { createAnimeFallbackSeeds } from '@/infrastructure/repositories/catalog/catalog-utils';
import { normalizeHtmlLineBreaks } from '@/shared/utils/html-text';

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function firstUrl(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const normalized = nonEmpty(value);
    if (normalized) return normalized;
  }
  return null;
}

function preferredTitle(title: AniListMediaTitle, id: number): string {
  return (
    nonEmpty(title.english) ??
    nonEmpty(title.romaji) ??
    nonEmpty(title.native) ??
    `Anime ${id}`
  );
}

function alternativeTitles(
  dto: AniListMediaSummary | AniListMediaDetails,
  primary: string,
): string[] {
  const candidates = [
    dto.title.english,
    dto.title.romaji,
    dto.title.native,
    ...('synonyms' in dto ? dto.synonyms : []),
  ];
  const seen = new Set([primary.toLocaleLowerCase()]);
  return candidates.flatMap((candidate) => {
    const title = nonEmpty(candidate);
    if (!title) return [];
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [title];
  });
}

function readableSeason(season: string | null): string | null {
  const seasons: Record<string, string> = {
    WINTER: 'Winter',
    SPRING: 'Spring',
    SUMMER: 'Summer',
    FALL: 'Fall',
  };
  return season ? (seasons[season] ?? null) : null;
}

export function mapAniListAiringStatus(
  status: string | null | undefined,
): AnimeAiringStatus {
  const statuses: Record<string, AnimeAiringStatus> = {
    RELEASING: 'releasing',
    FINISHED: 'finished',
    NOT_YET_RELEASED: 'not_yet_released',
    CANCELLED: 'cancelled',
    HIATUS: 'hiatus',
  };
  return status ? (statuses[status] ?? 'unknown') : 'unknown';
}

export function mapAniListReleasedEpisodes(
  totalEpisodes: number | null,
  airingStatus: AnimeAiringStatus,
  nextAiringEpisode: number | null,
): number | null {
  if (airingStatus === 'finished') return totalEpisodes;
  return nextAiringEpisode !== null &&
    Number.isInteger(nextAiringEpisode) &&
    nextAiringEpisode >= 1
    ? nextAiringEpisode - 1
    : null;
}

function relationKind(value: string | null): AnimeContinuityKind | null {
  if (value === 'PREQUEL') return 'prequel';
  if (value === 'SEQUEL') return 'sequel';
  return null;
}

function continuity(dto: AniListMediaDetails): AnimeContinuityRelation[] {
  if (dto.idMal === null) return [];
  const grouped: Record<AnimeContinuityKind, AnimeContinuityRelation[]> = {
    prequel: [],
    sequel: [],
  };
  const seen = new Set<string>();
  dto.relations.forEach((relation) => {
    const kind = relationKind(relation.relationType);
    const id = relation.idMal;
    if (
      !kind ||
      relation.type !== 'ANIME' ||
      id === null ||
      !Number.isInteger(id) ||
      id <= 0 ||
      id === dto.idMal
    ) {
      return;
    }
    const key = `${kind}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    grouped[kind].push({
      animeId: id,
      title: preferredTitle(relation.title, id),
      kind,
    });
  });
  return [...grouped.prequel, ...grouped.sequel];
}

function streamingServices(dto: AniListMediaDetails): AnimeStreamingService[] {
  const seen = new Set<string>();
  return dto.externalLinks.flatMap((link) => {
    const name = nonEmpty(link.site);
    const key = name?.toLocaleLowerCase();
    if (
      !name ||
      !key ||
      link.type !== 'STREAMING' ||
      link.isDisabled === true ||
      seen.has(key)
    ) {
      return [];
    }
    seen.add(key);
    const iconUrl = nonEmpty(link.icon);
    return [
      {
        name,
        iconUrl: iconUrl && /^https?:\/\/\S+$/i.test(iconUrl) ? iconUrl : null,
      },
    ];
  });
}

export function mapAniListSummary(
  dto: AniListMediaSummary,
): AnimeCatalogItem | null {
  if (dto.idMal === null || !Number.isInteger(dto.idMal) || dto.idMal <= 0) {
    return null;
  }
  const title = preferredTitle(dto.title, dto.idMal);
  const totalEpisodes =
    dto.episodes !== null && Number.isInteger(dto.episodes) && dto.episodes > 0
      ? dto.episodes
      : null;
  const airingStatus = mapAniListAiringStatus(dto.status);
  const releasedEpisodes = mapAniListReleasedEpisodes(
    totalEpisodes,
    airingStatus,
    dto.nextAiringEpisode?.episode ?? null,
  );
  return {
    id: dto.idMal,
    title,
    alternativeTitles: alternativeTitles(dto, title),
    synopsis: '',
    genres: dto.genres.flatMap((genre) => {
      const name = nonEmpty(genre);
      return name ? [name] : [];
    }),
    studios: [],
    totalEpisodes,
    releasedEpisodes,
    score:
      dto.averageScore !== null &&
      Number.isFinite(dto.averageScore) &&
      dto.averageScore >= 0 &&
      dto.averageScore <= 100
        ? dto.averageScore / 10
        : null,
    season: readableSeason(dto.season),
    year:
      dto.seasonYear !== null && Number.isInteger(dto.seasonYear)
        ? dto.seasonYear
        : null,
    airingStatus,
    posterImageUrl: firstUrl(
      dto.coverImage.large,
      dto.coverImage.medium,
      dto.coverImage.extraLarge,
    ),
    largePosterImageUrl: firstUrl(
      dto.coverImage.extraLarge,
      dto.coverImage.large,
      dto.coverImage.medium,
    ),
    heroImageUrl: nonEmpty(dto.bannerImage),
    continuity: [],
    streamingServices: [],
    ...createAnimeFallbackSeeds(dto.idMal),
  };
}

export function mapAniListDetails(
  dto: AniListMediaDetails,
): AnimeCatalogItem | null {
  const summary = mapAniListSummary(dto);
  if (!summary) return null;
  return {
    ...summary,
    alternativeTitles: alternativeTitles(dto, summary.title),
    synopsis: nonEmpty(normalizeHtmlLineBreaks(dto.description)) ?? '',
    studios: dto.studios.flatMap((studio) => {
      const name = nonEmpty(studio.name);
      return name ? [name] : [];
    }),
    continuity: continuity(dto),
    streamingServices: streamingServices(dto),
  };
}
