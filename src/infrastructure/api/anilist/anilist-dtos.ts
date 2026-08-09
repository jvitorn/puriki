export interface AniListMediaTitle {
  romaji: string | null;
  english: string | null;
  native: string | null;
}

export interface AniListCoverImage {
  extraLarge: string | null;
  large: string | null;
  medium: string | null;
  color: string | null;
}

export interface AniListMediaSummary {
  id: number;
  idMal: number | null;
  title: AniListMediaTitle;
  episodes: number | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  genres: string[];
  coverImage: AniListCoverImage;
  bannerImage: string | null;
}

export interface AniListRelation {
  relationType: string | null;
  id: number;
  idMal: number | null;
  type: string | null;
  title: AniListMediaTitle;
  mediumCoverUrl: string | null;
}

export interface AniListMediaDetails extends AniListMediaSummary {
  synonyms: string[];
  description: string | null;
  studios: { id: number; name: string }[];
  relations: AniListRelation[];
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

export interface AniListPageInfo {
  currentPage: number | null;
  hasNextPage: boolean | null;
  lastPage: number | null;
}

export interface AniListPageResult {
  media: AniListMediaSummary[];
  pageInfo: AniListPageInfo | null;
}

export interface AniListCombinedHomeResult {
  popular: AniListMediaSummary[];
  seasonal: AniListMediaSummary[];
  upcoming: AniListMediaSummary[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`AniList returned an invalid ${field}.`);
  }
  return value;
}

function parseTitle(value: unknown): AniListMediaTitle {
  if (!isRecord(value)) {
    throw new Error('AniList returned an invalid media title.');
  }
  return {
    romaji: nullableString(value.romaji),
    english: nullableString(value.english),
    native: nullableString(value.native),
  };
}

function parseCover(value: unknown): AniListCoverImage {
  if (value === null || value === undefined) {
    return { extraLarge: null, large: null, medium: null, color: null };
  }
  if (!isRecord(value)) {
    throw new Error('AniList returned an invalid cover image.');
  }
  return {
    extraLarge: nullableString(value.extraLarge),
    large: nullableString(value.large),
    medium: nullableString(value.medium),
    color: nullableString(value.color),
  };
}

export function parseAniListMediaSummary(value: unknown): AniListMediaSummary {
  if (!isRecord(value)) {
    throw new Error('AniList returned an invalid media object.');
  }
  return {
    id: requiredInteger(value.id, 'media ID'),
    idMal:
      value.idMal === null || value.idMal === undefined
        ? null
        : requiredInteger(value.idMal, 'MAL ID'),
    title: parseTitle(value.title),
    episodes: nullableNumber(value.episodes),
    status: nullableString(value.status),
    season: nullableString(value.season),
    seasonYear: nullableNumber(value.seasonYear),
    averageScore: nullableNumber(value.averageScore),
    genres: Array.isArray(value.genres)
      ? value.genres.filter(
          (genre): genre is string => typeof genre === 'string',
        )
      : [],
    coverImage: parseCover(value.coverImage),
    bannerImage: nullableString(value.bannerImage),
  };
}

function parseStudios(value: unknown): { id: number; name: string }[] {
  if (value === null || value === undefined) return [];
  if (!isRecord(value) || !Array.isArray(value.nodes)) {
    throw new Error('AniList returned invalid studio data.');
  }
  return value.nodes.map((node) => {
    if (!isRecord(node) || typeof node.name !== 'string') {
      throw new Error('AniList returned an invalid studio.');
    }
    return { id: requiredInteger(node.id, 'studio ID'), name: node.name };
  });
}

function parseRelations(value: unknown): AniListRelation[] {
  if (value === null || value === undefined) return [];
  if (!isRecord(value) || !Array.isArray(value.edges)) {
    throw new Error('AniList returned invalid relation data.');
  }
  return value.edges.map((edge) => {
    if (!isRecord(edge) || !isRecord(edge.node)) {
      throw new Error('AniList returned an invalid relation.');
    }
    const node = edge.node;
    const cover = parseCover(node.coverImage);
    return {
      relationType: nullableString(edge.relationType),
      id: requiredInteger(node.id, 'related media ID'),
      idMal:
        node.idMal === null || node.idMal === undefined
          ? null
          : requiredInteger(node.idMal, 'related MAL ID'),
      type: nullableString(node.type),
      title: parseTitle(node.title),
      mediumCoverUrl: cover.medium,
    };
  });
}

function parseNextAiring(
  value: unknown,
): AniListMediaDetails['nextAiringEpisode'] {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new Error('AniList returned invalid airing data.');
  }
  return {
    episode: requiredInteger(value.episode, 'next airing episode'),
    airingAt: requiredInteger(value.airingAt, 'next airing timestamp'),
  };
}

export function parseAniListMediaDetails(value: unknown): AniListMediaDetails {
  if (!isRecord(value)) {
    throw new Error('AniList returned invalid details data.');
  }
  return {
    ...parseAniListMediaSummary(value),
    synonyms: Array.isArray(value.synonyms)
      ? value.synonyms.filter(
          (synonym): synonym is string => typeof synonym === 'string',
        )
      : [],
    description: nullableString(value.description),
    studios: parseStudios(value.studios),
    relations: parseRelations(value.relations),
    nextAiringEpisode: parseNextAiring(value.nextAiringEpisode),
  };
}

function parsePageInfo(value: unknown): AniListPageInfo | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) {
    throw new Error('AniList returned invalid pagination data.');
  }
  return {
    currentPage: nullableNumber(value.currentPage),
    hasNextPage:
      typeof value.hasNextPage === 'boolean' ? value.hasNextPage : null,
    lastPage: nullableNumber(value.lastPage),
  };
}

function parseMediaArray(value: unknown): AniListMediaSummary[] {
  if (!Array.isArray(value)) {
    throw new Error('AniList returned an invalid media collection.');
  }
  return value.map(parseAniListMediaSummary);
}

export function parseAniListPageData(value: unknown): AniListPageResult {
  if (!isRecord(value) || !isRecord(value.Page)) {
    throw new Error('AniList returned an invalid Page response.');
  }
  return {
    media: parseMediaArray(value.Page.media),
    pageInfo: parsePageInfo(value.Page.pageInfo),
  };
}

export function parseAniListDetailsData(value: unknown): AniListMediaDetails {
  if (!isRecord(value) || value.Media === null || value.Media === undefined) {
    throw new Error('AniList returned no details media.');
  }
  return parseAniListMediaDetails(value.Media);
}

export function parseAniListNullableDetailsData(
  value: unknown,
): AniListMediaDetails | null {
  if (!isRecord(value) || !('Media' in value)) {
    throw new Error('AniList returned invalid details data.');
  }
  return value.Media === null ? null : parseAniListMediaDetails(value.Media);
}

export function parseAniListPageAlias(
  value: unknown,
  alias: string,
): AniListPageResult {
  if (!isRecord(value) || !isRecord(value[alias])) {
    throw new Error(`AniList returned no ${alias} catalog section.`);
  }
  const page = value[alias];
  return {
    media: parseMediaArray(page.media),
    pageInfo: parsePageInfo(page.pageInfo),
  };
}

export function parseAniListCombinedHomeData(
  value: unknown,
): AniListCombinedHomeResult {
  if (!isRecord(value)) {
    throw new Error('AniList returned invalid combined Home data.');
  }
  const parseAlias = (alias: string): AniListMediaSummary[] => {
    return parseAniListPageAlias(value, alias).media;
  };
  return {
    popular: parseAlias('popular'),
    seasonal: parseAlias('seasonal'),
    upcoming: parseAlias('upcoming'),
  };
}

export function aniListDisplayTitle(media: AniListMediaSummary): string {
  return media.title.english ?? media.title.romaji ?? media.title.native ?? '—';
}
