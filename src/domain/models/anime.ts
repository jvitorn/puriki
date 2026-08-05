export type AnimeListStatus =
  'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export interface AnimeCatalogItem {
  id: number;
  title: string;
  alternativeTitles: string[];
  synopsis: string;
  genres: string[];
  studios: string[];
  totalEpisodes: number | null;
  score: number | null;
  season: string | null;
  year: number | null;
  airingStatus: string;
  coverSeed: number;
  bannerSeed: number;
}

export interface UserAnimeEntry {
  animeId: number;
  status: AnimeListStatus;
  watchedEpisodes: number;
  userScore: number | null;
  updatedAt: string;
}

export interface UnifiedAnime {
  anime: AnimeCatalogItem;
  userEntry?: UserAnimeEntry;
}

export interface HomeSections {
  featured: AnimeCatalogItem;
  continueWatching: UnifiedAnime[];
  popular: AnimeCatalogItem[];
  seasonal: AnimeCatalogItem[];
  recentlyAdded: AnimeCatalogItem[];
}
