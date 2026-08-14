import type {
  AnimeCatalogItem,
  AnimeContinuityKind,
  AnimeContinuityRelation,
} from '@/domain/models/anime';
import type { MalAnimeDto } from '@/infrastructure/api/mal/mal-dtos';
import { createAnimeFallbackSeeds } from '@/infrastructure/repositories/catalog/catalog-utils';

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function firstUrl(...values: (string | undefined)[]): string | null {
  for (const value of values) {
    const normalized = nonEmpty(value);
    if (normalized) return normalized;
  }
  return null;
}

function alternativeTitles(dto: MalAnimeDto): string[] {
  const candidates = [
    dto.alternative_titles?.en,
    dto.alternative_titles?.ja,
    ...(dto.alternative_titles?.synonyms ?? []),
  ];
  const seen = new Set([dto.title.trim().toLocaleLowerCase()]);
  return candidates.flatMap((candidate) => {
    const title = nonEmpty(candidate);
    if (!title) return [];
    const key = title.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [title];
  });
}

function readableStatus(status: string | undefined): string {
  const normalized = nonEmpty(status);
  if (!normalized) return 'Status unknown';
  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readableSeason(season: string | undefined): string | null {
  const normalized = nonEmpty(season);
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : null;
}

function continuityKind(value: string): AnimeContinuityKind | null {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === 'prequel' || normalized === 'sequel') return normalized;
  return null;
}

function continuity(dto: MalAnimeDto): AnimeContinuityRelation[] {
  const byKind: Record<AnimeContinuityKind, AnimeContinuityRelation[]> = {
    prequel: [],
    sequel: [],
  };
  const seen = new Set<string>();
  for (const relation of dto.related_anime ?? []) {
    const kind = continuityKind(relation.relation_type);
    const title = nonEmpty(relation.node.title);
    if (!kind || relation.node.id === dto.id || !title) continue;
    const key = `${kind}:${relation.node.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    byKind[kind].push({ animeId: relation.node.id, title, kind });
  }
  return [...byKind.prequel, ...byKind.sequel];
}

export function mapMalAnime(
  dto: MalAnimeDto,
  payload: 'summary' | 'details' = 'summary',
): AnimeCatalogItem {
  const mediumPicture = firstUrl(dto.main_picture?.medium);
  const largePicture = firstUrl(
    dto.main_picture?.large,
    dto.main_picture?.medium,
  );
  return {
    id: dto.id,
    title: dto.title.trim(),
    alternativeTitles: alternativeTitles(dto),
    synopsis: nonEmpty(dto.synopsis) ?? '',
    genres: (dto.genres ?? []).flatMap((genre) => {
      const name = nonEmpty(genre.name);
      return name ? [name] : [];
    }),
    studios: (dto.studios ?? []).flatMap((studio) => {
      const name = nonEmpty(studio.name);
      return name ? [name] : [];
    }),
    totalEpisodes:
      typeof dto.num_episodes === 'number' && dto.num_episodes > 0
        ? dto.num_episodes
        : null,
    score:
      typeof dto.mean === 'number' && Number.isFinite(dto.mean)
        ? dto.mean
        : null,
    season: readableSeason(dto.start_season?.season),
    year:
      typeof dto.start_season?.year === 'number' &&
      Number.isInteger(dto.start_season.year)
        ? dto.start_season.year
        : null,
    airingStatus: readableStatus(dto.status),
    posterImageUrl: mediumPicture ?? largePicture,
    largePosterImageUrl: largePicture ?? mediumPicture,
    heroImageUrl: largePicture ?? mediumPicture,
    continuity: payload === 'details' ? continuity(dto) : [],
    streamingServices: [],
    ...createAnimeFallbackSeeds(dto.id),
  };
}
