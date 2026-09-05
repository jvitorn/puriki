import type {
  AnimeCatalogItem,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';

let nextAnimeId = 1;

export function resetAnimeBuilder(): void {
  nextAnimeId = 1;
}

export function makeAnime(
  overrides: Partial<AnimeCatalogItem> = {},
): AnimeCatalogItem {
  const id = overrides.id ?? nextAnimeId++;
  const totalEpisodes =
    overrides.totalEpisodes === undefined ? 12 : overrides.totalEpisodes;
  const airingStatus = overrides.airingStatus ?? 'finished';
  const releasedEpisodes =
    overrides.releasedEpisodes !== undefined
      ? overrides.releasedEpisodes
      : airingStatus === 'finished'
        ? totalEpisodes
        : null;
  return {
    id,
    title: `Anime ${id}`,
    alternativeTitles: [`Anime ${id} Alternative`],
    synopsis: `Synopsis for Anime ${id}.`,
    genres: ['Adventure', 'Fantasy'],
    studios: ['Puriki Test Studio'],
    totalEpisodes,
    releasedEpisodes,
    score: 8,
    season: 'Spring',
    year: 2026,
    airingStatus,
    posterImageUrl: null,
    largePosterImageUrl: null,
    heroImageUrl: null,
    continuity: [],
    streamingServices: [],
    coverSeed: id * 17,
    bannerSeed: id * 31,
    ...overrides,
  };
}

export function makeUserAnimeEntry(
  overrides: Partial<UserAnimeEntry> & Pick<UserAnimeEntry, 'animeId'>,
): UserAnimeEntry {
  return {
    status: 'plan_to_watch',
    watchedEpisodes: 0,
    userScore: null,
    updatedAt: new Date(
      Date.UTC(2026, 0, 1, 12, overrides.animeId),
    ).toISOString(),
    ...overrides,
  };
}

export function makeUnifiedAnime(
  animeOverrides: Partial<AnimeCatalogItem> = {},
  entryOverrides?: Partial<UserAnimeEntry>,
): UnifiedAnime {
  const anime = makeAnime(animeOverrides);
  return {
    anime,
    userEntry: entryOverrides
      ? makeUserAnimeEntry({ animeId: anime.id, ...entryOverrides })
      : undefined,
  };
}

export function buildWatchingAnime(
  overrides: Partial<UnifiedAnime['anime']> = {},
): UnifiedAnime {
  return makeUnifiedAnime(
    {
      id: 101,
      title: 'Test Horizon',
      totalEpisodes: 12,
      coverSeed: 42,
      ...overrides,
    },
    { status: 'watching', watchedEpisodes: 4, userScore: 8 },
  );
}
