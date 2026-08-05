import type {
  AnimeCatalogItem,
  AnimeListStatus,
  UserAnimeEntry,
} from '@/domain/models/anime';
import { MOCK_SEED } from '@/mocks/config/mock-config';
import {
  createAnimeCatalogItem,
  createUserAnimeEntry,
  resetAnimeFactory,
} from '@/mocks/factories/anime-factory';

export interface MockDataset {
  catalog: AnimeCatalogItem[];
  userEntries: UserAnimeEntry[];
}

const curatedTitles = [
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
];

const statuses: AnimeListStatus[] = [
  'watching',
  'completed',
  'on_hold',
  'dropped',
  'plan_to_watch',
];

export function buildMockDataset(seed = MOCK_SEED): MockDataset {
  resetAnimeFactory(seed);
  const catalog = curatedTitles.map((title, index) =>
    createAnimeCatalogItem({
      id: index + 1,
      title,
      alternativeTitles:
        index === 0
          ? ['Gekko no Senjin', 'Moon Vanguard']
          : [`${title} Alternative`],
      totalEpisodes: index === 6 ? null : ([12, 13, 24, 26][index % 4] ?? 12),
      airingStatus: index % 3 === 0 ? 'Airing' : 'Finished Airing',
    }),
  );
  const userEntries = catalog.slice(0, 25).map((anime, index) => {
    const status = statuses[index % statuses.length] ?? 'plan_to_watch';
    const total = anime.totalEpisodes;
    const watchedEpisodes =
      status === 'completed'
        ? (total ?? 18)
        : status === 'plan_to_watch'
          ? 0
          : Math.min((index % 8) + 1, total ?? Number.POSITIVE_INFINITY);
    return createUserAnimeEntry({
      animeId: anime.id,
      status,
      watchedEpisodes,
      userScore: index % 3 === 0 ? (index % 10) + 1 : null,
    });
  });
  return { catalog, userEntries };
}

export const initialMockDataset = buildMockDataset();
