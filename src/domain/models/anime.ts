export type AnimeListStatus =
  'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export type AnimeContinuityKind = 'prequel' | 'sequel';

export interface AnimeContinuityRelation {
  animeId: number;
  title: string;
  kind: AnimeContinuityKind;
}

export interface AnimeStreamingService {
  name: string;
  iconUrl: string | null;
}

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
  posterImageUrl: string | null;
  largePosterImageUrl: string | null;
  heroImageUrl: string | null;
  continuity: AnimeContinuityRelation[];
  streamingServices: AnimeStreamingService[];
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
  upcoming: AnimeCatalogItem[];
}
