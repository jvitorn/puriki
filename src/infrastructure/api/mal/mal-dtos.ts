export interface MalPictureDto {
  medium?: string;
  large?: string;
}

export interface MalAlternativeTitlesDto {
  synonyms?: string[];
  en?: string;
  ja?: string;
}

export interface MalNamedResourceDto {
  id: number;
  name: string;
}

export interface MalAnimeDto {
  id: number;
  title: string;
  main_picture?: MalPictureDto;
  alternative_titles?: MalAlternativeTitlesDto;
  synopsis?: string;
  mean?: number;
  genres?: MalNamedResourceDto[];
  studios?: MalNamedResourceDto[];
  num_episodes?: number;
  status?: string;
  start_season?: {
    year?: number;
    season?: string;
  };
}

export interface MalCollectionResponse<T> {
  data: {
    node: T;
    ranking?: { rank: number };
  }[];
  paging?: {
    previous?: string;
    next?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  );
}

function isPicture(value: unknown): value is MalPictureDto {
  return (
    isRecord(value) &&
    isOptionalString(value.medium) &&
    isOptionalString(value.large)
  );
}

function isAlternativeTitles(value: unknown): value is MalAlternativeTitlesDto {
  return (
    isRecord(value) &&
    isOptionalString(value.en) &&
    isOptionalString(value.ja) &&
    (value.synonyms === undefined ||
      (Array.isArray(value.synonyms) &&
        value.synonyms.every((title) => typeof title === 'string')))
  );
}

function isNamedResources(value: unknown): value is MalNamedResourceDto[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        Number.isInteger(item.id) &&
        typeof item.name === 'string',
    )
  );
}

function isStartSeason(
  value: unknown,
): value is NonNullable<MalAnimeDto['start_season']> {
  return (
    isRecord(value) &&
    (value.year === undefined || Number.isInteger(value.year)) &&
    isOptionalString(value.season)
  );
}

export function isMalAnimeDto(value: unknown): value is MalAnimeDto {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.id) &&
    (value.id as number) > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.main_picture === undefined || isPicture(value.main_picture)) &&
    (value.alternative_titles === undefined ||
      isAlternativeTitles(value.alternative_titles)) &&
    isOptionalString(value.synopsis) &&
    isOptionalFiniteNumber(value.mean) &&
    (value.genres === undefined || isNamedResources(value.genres)) &&
    (value.studios === undefined || isNamedResources(value.studios)) &&
    (value.num_episodes === undefined ||
      (Number.isInteger(value.num_episodes) &&
        (value.num_episodes as number) >= 0)) &&
    isOptionalString(value.status) &&
    (value.start_season === undefined || isStartSeason(value.start_season))
  );
}

function isRanking(value: unknown): value is { rank: number } {
  return isRecord(value) && Number.isInteger(value.rank);
}

function isPaging(value: unknown): boolean {
  return (
    isRecord(value) &&
    isOptionalString(value.previous) &&
    isOptionalString(value.next)
  );
}

export function isMalCollectionResponse(
  value: unknown,
): value is MalCollectionResponse<MalAnimeDto> {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(
      (edge) =>
        isRecord(edge) &&
        isMalAnimeDto(edge.node) &&
        (edge.ranking === undefined || isRanking(edge.ranking)),
    ) &&
    (value.paging === undefined || isPaging(value.paging))
  );
}

export const isMalDetailResponse = isMalAnimeDto;
