import type { AnimeCatalogItem } from '@/domain/models/anime';
import type {
  JikanAnimeDto,
  JikanImageVariantDto,
} from '@/infrastructure/api/jikan/jikan-dtos';

const FALLBACK_SYNOPSIS = 'No synopsis is available for this anime.';
const FALLBACK_STATUS = 'Status unknown';

function nonEmpty(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function firstUrl(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const url = nonEmpty(candidate);
    if (url) return url;
  }
  return null;
}

function imageField(
  variant: JikanImageVariantDto | null | undefined,
  field: keyof JikanImageVariantDto,
): string | null | undefined {
  return variant?.[field];
}

function alternativeTitles(dto: JikanAnimeDto): string[] {
  const candidates = [
    dto.title_english,
    dto.title_japanese,
    ...(dto.title_synonyms ?? []),
  ];
  const primaryKey = dto.title.trim().toLocaleLowerCase();
  const seen = new Set<string>([primaryKey]);
  const titles: string[] = [];
  for (const candidate of candidates) {
    const title = nonEmpty(candidate);
    if (!title) continue;
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

function capitalize(value: string | null | undefined): string | null {
  const normalized = nonEmpty(value);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : null;
}

export function createAnimeFallbackSeeds(id: number): {
  coverSeed: number;
  bannerSeed: number;
} {
  const coverSeed = Math.abs(Math.imul(id, 2_654_435_761)) % 10_000;
  const bannerSeed =
    Math.abs(Math.imul(id ^ 0x9e3779b9, 1_597_334_677)) % 10_000;
  return { coverSeed, bannerSeed };
}

export function mapJikanAnime(dto: JikanAnimeDto): AnimeCatalogItem {
  const largePosterImageUrl = firstUrl(
    imageField(dto.images?.webp, 'large_image_url'),
    imageField(dto.images?.jpg, 'large_image_url'),
    imageField(dto.images?.webp, 'image_url'),
    imageField(dto.images?.jpg, 'image_url'),
  );
  const posterImageUrl = firstUrl(
    imageField(dto.images?.webp, 'image_url'),
    imageField(dto.images?.jpg, 'image_url'),
    largePosterImageUrl,
  );
  const heroImageUrl = firstUrl(
    dto.trailer?.images?.maximum_image_url,
    dto.trailer?.images?.large_image_url,
    largePosterImageUrl,
  );

  return {
    id: dto.mal_id,
    title: nonEmpty(dto.title) ?? `Anime ${dto.mal_id}`,
    alternativeTitles: alternativeTitles(dto),
    synopsis: nonEmpty(dto.synopsis) ?? FALLBACK_SYNOPSIS,
    genres: (dto.genres ?? []).flatMap((genre) => {
      const name = nonEmpty(genre.name);
      return name ? [name] : [];
    }),
    studios: (dto.studios ?? []).flatMap((studio) => {
      const name = nonEmpty(studio.name);
      return name ? [name] : [];
    }),
    totalEpisodes:
      typeof dto.episodes === 'number' && dto.episodes >= 0
        ? dto.episodes
        : null,
    score:
      typeof dto.score === 'number' && Number.isFinite(dto.score)
        ? dto.score
        : null,
    season: capitalize(dto.season),
    year:
      typeof dto.year === 'number' && Number.isInteger(dto.year)
        ? dto.year
        : null,
    airingStatus: nonEmpty(dto.status) ?? FALLBACK_STATUS,
    posterImageUrl,
    largePosterImageUrl,
    heroImageUrl,
    ...createAnimeFallbackSeeds(dto.mal_id),
  };
}
