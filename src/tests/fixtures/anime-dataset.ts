import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { makeAnime, makeUserAnimeEntry } from '@/tests/builders/anime-builder';

export interface TestAnimeDataset {
  catalog: AnimeCatalogItem[];
  userEntries: UserAnimeEntry[];
}

const TITLES = [
  'Moonlit Vanguard',
  'Ember Archive',
  'Neon Ronin',
  'Paper Constellations',
  'The Last Sky Garden',
  'Clockwork Reverie',
  'Starlight Courier',
  'Tides of Aozora',
  'Velvet Thunder',
  'Parallel Summer',
  'Silver Orchard',
  'Midnight Bento Club',
  'Echoes of Tomorrow',
  'Crimson Atelier',
  'Wandering Polaris',
  'Kite Strings and Comets',
  'Lanterns at Dawn',
  'The Quiet Alchemist',
  'After-School Orbit',
  'Bloom Protocol',
  'Frostfire Academy',
  'Memory of Rain',
  'Signal from Europa',
  'Horizon Breakers',
  'Café Nebula',
  'The Glass Shogun',
  'Wildflower Circuit',
  'Dreams in Stereo',
  'Golden Hour Detectives',
  'Spirit Rail Express',
  'Cerulean Knights',
  'My Neighbor Is a Time Traveler',
  'Sunset Mecha Brigade',
  'Rainy Day Rhapsody',
  'Quantum Heartbeat',
  'Sakura Frequency',
  'The Fox and the Meteor',
  'Northwind Chronicle',
  'Electric Shrine',
  'A Thousand Tiny Adventures',
  'Dandelion Squadron',
  'Mosaic Memories',
  'Orbiting You',
  'Phantom Bookshop',
  'Summer Snowfall',
  'Tea for Two Heroes',
  'Violet Harbor',
  'Whispering Satellites',
  'Zero Gravity Kitchen',
  'Aurora Sketchbook',
] as const;

const STATUSES: AnimeListStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

export function buildTestAnimeDataset(): TestAnimeDataset {
  const catalog = TITLES.map((title, index) => {
    const totalEpisodes = index === 6 ? null : [12, 13, 24, 26][index % 4]!;
    const airingStatus = index % 3 === 0 ? 'releasing' : 'finished';
    return makeAnime({
      id: index + 1,
      title,
      alternativeTitles:
        index === 0
          ? ['Gekko no Senjin', 'Moon Vanguard']
          : [`${title} Alternative`],
      totalEpisodes,
      releasedEpisodes:
        airingStatus === 'releasing'
          ? Math.min(4, totalEpisodes ?? 4)
          : totalEpisodes,
      score: 7 + (index % 20) / 10,
      season: ['Winter', 'Spring', 'Summer', 'Fall'][index % 4] ?? 'Spring',
      year: 2015 + (index % 12),
      airingStatus,
    });
  });
  const userEntries = catalog.slice(0, 25).map((anime, index) => {
    const status = STATUSES[index % STATUSES.length] ?? 'plan_to_watch';
    const watchedEpisodes =
      status === 'completed'
        ? (anime.totalEpisodes ?? 18)
        : status === 'plan_to_watch'
          ? 0
          : Math.min(
              index % 8,
              anime.totalEpisodes ?? Number.POSITIVE_INFINITY,
            ) + 1;
    return makeUserAnimeEntry({
      animeId: anime.id,
      status,
      watchedEpisodes,
      userScore: index % 3 === 0 ? (index % 10) + 1 : null,
    });
  });
  return { catalog, userEntries };
}

export function buildUserListDataset({
  size,
  status,
}: {
  size: number;
  status?: AnimeListStatus;
}): TestAnimeDataset {
  const catalog = Array.from({ length: size }, (_, index) =>
    makeAnime({
      id: 10_001 + index,
      title: `Generated Anime ${index + 1}`,
      totalEpisodes: 12,
    }),
  );
  const userEntries = catalog.map((anime, index) =>
    makeUserAnimeEntry({
      animeId: anime.id,
      status: status ?? STATUSES[index % STATUSES.length] ?? 'watching',
      watchedEpisodes: index % 12,
    }),
  );
  return { catalog, userEntries };
}

export type TestScenarioName =
  | 'default'
  | 'empty'
  | 'long-titles'
  | 'unknown-episodes'
  | 'watching-only'
  | 'completed-only';

export function createTestScenario(name: TestScenarioName): TestAnimeDataset {
  const base = buildTestAnimeDataset();
  if (name === 'empty') return { catalog: [], userEntries: [] };
  if (name === 'long-titles') {
    return {
      catalog: [
        makeAnime({
          title:
            'The Cartographer Who Crossed the Endless Starlit Sea to Find Tomorrow',
        }),
      ],
      userEntries: [],
    };
  }
  if (name === 'unknown-episodes') {
    return {
      catalog: [makeAnime({ totalEpisodes: null, airingStatus: 'releasing' })],
      userEntries: [],
    };
  }
  if (name === 'watching-only') {
    return {
      ...base,
      userEntries: base.userEntries.filter(
        (entry) => entry.status === 'watching',
      ),
    };
  }
  if (name === 'completed-only') {
    return {
      ...base,
      userEntries: base.userEntries.filter(
        (entry) => entry.status === 'completed',
      ),
    };
  }
  return base;
}
