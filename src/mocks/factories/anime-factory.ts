import { faker } from '@faker-js/faker';

import type {
  AnimeCatalogItem,
  HomeSections,
  UnifiedAnime,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { MOCK_SEED } from '@/mocks/config/mock-config';

let animeSequence = 1;

const genrePool = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
];

const studios = [
  'Aster Works',
  'Blueframe',
  'Comet House',
  'Lantern Studio',
  'Northstar',
];

export function resetAnimeFactory(seed = MOCK_SEED): void {
  animeSequence = 1;
  faker.seed(seed);
}

export function createAnimeCatalogItem(
  overrides: Partial<AnimeCatalogItem> = {},
): AnimeCatalogItem {
  const id = overrides.id ?? animeSequence++;
  const title =
    overrides.title ?? `${faker.word.adjective()} ${faker.word.noun()}`;
  return {
    id,
    title,
    alternativeTitles: [faker.word.words({ count: { min: 2, max: 4 } })],
    synopsis: faker.lorem.sentences({ min: 2, max: 4 }),
    genres: faker.helpers.arrayElements(genrePool, { min: 2, max: 3 }),
    studios: [faker.helpers.arrayElement(studios)],
    totalEpisodes: faker.helpers.arrayElement([12, 13, 24, 26, 48, null]),
    score: faker.number.float({ min: 6.1, max: 9.4, fractionDigits: 1 }),
    season: faker.helpers.arrayElement(['Winter', 'Spring', 'Summer', 'Fall']),
    year: faker.number.int({ min: 2014, max: 2026 }),
    airingStatus: faker.helpers.arrayElement([
      'Airing',
      'Finished Airing',
      'Not Yet Aired',
    ]),
    posterImageUrl: null,
    largePosterImageUrl: null,
    heroImageUrl: null,
    continuity: [],
    coverSeed: faker.number.int({ min: 1, max: 9999 }),
    bannerSeed: faker.number.int({ min: 1, max: 9999 }),
    ...overrides,
  };
}

export function createUserAnimeEntry(
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

export function createUnifiedAnime(
  animeOverrides: Partial<AnimeCatalogItem> = {},
  entryOverrides?: Partial<UserAnimeEntry>,
): UnifiedAnime {
  const anime = createAnimeCatalogItem(animeOverrides);
  return {
    anime,
    userEntry: entryOverrides
      ? createUserAnimeEntry({ animeId: anime.id, ...entryOverrides })
      : undefined,
  };
}

export function createHomeSections(
  catalog: AnimeCatalogItem[],
  entries: UserAnimeEntry[],
): HomeSections {
  const featured = catalog[0];
  if (!featured)
    throw new Error('Home sections require at least one catalog item.');
  const continueWatching = entries
    .filter((entry) => entry.status === 'watching')
    .flatMap((userEntry): UnifiedAnime[] => {
      const anime = catalog.find((item) => item.id === userEntry.animeId);
      return anime ? [{ anime, userEntry }] : [];
    });
  return {
    featured,
    continueWatching,
    popular: catalog.slice(1, 13),
    seasonal: catalog.slice(13, 25),
    upcoming: catalog.slice(25, 37),
  };
}

export function createLongTitleAnime(): AnimeCatalogItem {
  return createAnimeCatalogItem({
    title:
      'The Cartographer Who Crossed the Endless Starlit Sea to Find Tomorrow',
    alternativeTitles: [
      'A Very Long Alternative Title for Careful Layout Testing',
    ],
  });
}

export function createUnknownEpisodesAnime(): AnimeCatalogItem {
  return createAnimeCatalogItem({
    totalEpisodes: null,
    airingStatus: 'Airing',
  });
}
