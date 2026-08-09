export interface JikanNamedResourceDto {
  mal_id?: number;
  name: string;
}

export interface JikanImageVariantDto {
  image_url?: string | null;
  small_image_url?: string | null;
  large_image_url?: string | null;
}

export interface JikanTrailerImagesDto {
  image_url?: string | null;
  small_image_url?: string | null;
  medium_image_url?: string | null;
  large_image_url?: string | null;
  maximum_image_url?: string | null;
}

export interface JikanRelationEntryDto {
  mal_id: number;
  type: string;
  name: string;
  url?: string | null;
}

export interface JikanRelationDto {
  relation: string;
  entry: JikanRelationEntryDto[];
}

export interface JikanAnimeDto {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  title_synonyms?: string[] | null;
  synopsis?: string | null;
  episodes?: number | null;
  score?: number | null;
  status?: string | null;
  season?: string | null;
  year?: number | null;
  genres?: JikanNamedResourceDto[] | null;
  studios?: JikanNamedResourceDto[] | null;
  images?: {
    jpg?: JikanImageVariantDto | null;
    webp?: JikanImageVariantDto | null;
  } | null;
  trailer?: {
    images?: JikanTrailerImagesDto | null;
  } | null;
  relations?: JikanRelationDto[] | null;
}

export interface JikanPaginationDto {
  last_visible_page?: number;
  has_next_page?: boolean;
  current_page?: number;
  items?: {
    count?: number;
    total?: number;
    per_page?: number;
  };
}

export interface JikanSingleResponse<T> {
  data: T;
}

export interface JikanCollectionResponse<T> {
  data: T[];
  pagination?: JikanPaginationDto;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalNullableNumber(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'number';
}

function isNamedResources(value: unknown): value is JikanNamedResourceDto[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item) && typeof item.name === 'string')
  );
}

function isImageVariant(value: unknown): value is JikanImageVariantDto {
  return (
    isRecord(value) &&
    isOptionalNullableString(value.image_url) &&
    isOptionalNullableString(value.small_image_url) &&
    isOptionalNullableString(value.large_image_url)
  );
}

function isImages(
  value: unknown,
): value is NonNullable<JikanAnimeDto['images']> {
  return (
    isRecord(value) &&
    (value.jpg === undefined ||
      value.jpg === null ||
      isImageVariant(value.jpg)) &&
    (value.webp === undefined ||
      value.webp === null ||
      isImageVariant(value.webp))
  );
}

function isTrailer(
  value: unknown,
): value is NonNullable<JikanAnimeDto['trailer']> {
  if (!isRecord(value)) return false;
  if (value.images === undefined || value.images === null) return true;
  return (
    isRecord(value.images) &&
    isOptionalNullableString(value.images.image_url) &&
    isOptionalNullableString(value.images.small_image_url) &&
    isOptionalNullableString(value.images.medium_image_url) &&
    isOptionalNullableString(value.images.large_image_url) &&
    isOptionalNullableString(value.images.maximum_image_url)
  );
}

function isRelationEntry(value: unknown): value is JikanRelationEntryDto {
  return (
    isRecord(value) &&
    Number.isInteger(value.mal_id) &&
    (value.mal_id as number) > 0 &&
    typeof value.type === 'string' &&
    typeof value.name === 'string' &&
    isOptionalNullableString(value.url)
  );
}

function isRelations(value: unknown): value is JikanRelationDto[] {
  return (
    Array.isArray(value) &&
    value.every(
      (relation) =>
        isRecord(relation) &&
        typeof relation.relation === 'string' &&
        Array.isArray(relation.entry) &&
        relation.entry.every(isRelationEntry),
    )
  );
}

export function isJikanAnimeDto(value: unknown): value is JikanAnimeDto {
  if (!isRecord(value)) return false;
  return (
    Number.isInteger(value.mal_id) &&
    typeof value.title === 'string' &&
    isOptionalNullableString(value.title_english) &&
    isOptionalNullableString(value.title_japanese) &&
    (value.title_synonyms === undefined ||
      value.title_synonyms === null ||
      (Array.isArray(value.title_synonyms) &&
        value.title_synonyms.every((title) => typeof title === 'string'))) &&
    isOptionalNullableString(value.synopsis) &&
    isOptionalNullableNumber(value.episodes) &&
    isOptionalNullableNumber(value.score) &&
    isOptionalNullableString(value.status) &&
    isOptionalNullableString(value.season) &&
    isOptionalNullableNumber(value.year) &&
    (value.genres === undefined ||
      value.genres === null ||
      isNamedResources(value.genres)) &&
    (value.studios === undefined ||
      value.studios === null ||
      isNamedResources(value.studios)) &&
    (value.images === undefined ||
      value.images === null ||
      isImages(value.images)) &&
    (value.trailer === undefined ||
      value.trailer === null ||
      isTrailer(value.trailer)) &&
    (value.relations === undefined ||
      value.relations === null ||
      isRelations(value.relations))
  );
}

export function isJikanSingleAnimeResponse(
  value: unknown,
): value is JikanSingleResponse<JikanAnimeDto> {
  return isRecord(value) && isJikanAnimeDto(value.data);
}

export function isJikanAnimeCollectionResponse(
  value: unknown,
): value is JikanCollectionResponse<JikanAnimeDto> {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    value.data.every(isJikanAnimeDto)
  );
}
