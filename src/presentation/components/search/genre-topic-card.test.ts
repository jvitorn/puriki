import {
  getGenreIcon,
  getGenreTopics,
} from '@/presentation/components/search/genre-topic-card';
import { makeAnime } from '@/tests/builders/anime-builder';

const SUPPORTED_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
] as const;

describe('genre topics', () => {
  it('uses a distinct icon for every supported genre', () => {
    const icons = SUPPORTED_GENRES.map(getGenreIcon);
    expect(new Set(icons).size).toBe(SUPPORTED_GENRES.length);
  });

  it('assigns a different anime to every topic when titles share genres', () => {
    const shared = makeAnime({ id: 1, genres: ['Comedy', 'Action'] });
    const comedy = makeAnime({ id: 2, genres: ['Comedy'] });
    const action = makeAnime({ id: 3, genres: ['Action'] });

    const topics = getGenreTopics([shared, comedy, action]);

    expect(topics.map((topic) => topic.genre)).toEqual(['Comedy', 'Action']);
    expect(new Set(topics.map((topic) => topic.anime.id)).size).toBe(2);
  });
});
