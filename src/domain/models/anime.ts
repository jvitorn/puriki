export type AnimeListStatus =
  'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';

export type AnimeAiringStatus =
  | 'releasing'
  | 'finished'
  | 'not_yet_released'
  | 'cancelled'
  | 'hiatus'
  | 'unknown';

export interface AnimeTrackingContext {
  totalEpisodes: number | null;
  releasedEpisodes: number | null;
  airingStatus: AnimeAiringStatus;
}

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
  releasedEpisodes?: number | null;
  score: number | null;
  season: string | null;
  year: number | null;
  airingStatus: AnimeAiringStatus;
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
