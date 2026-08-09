import animeFullFixture from '@/infrastructure/api/jikan/fixtures/anime-full.json';
import {
  isJikanSingleAnimeResponse,
  type JikanAnimeDto,
} from '@/infrastructure/api/jikan/jikan-dtos';
import {
  createAnimeFallbackSeeds,
  mapJikanAnime,
} from '@/infrastructure/api/jikan/jikan-mapper';

function completeDto(overrides: Partial<JikanAnimeDto> = {}): JikanAnimeDto {
  return {
    mal_id: 10,
    title: 'Fixture Anime',
    title_english: 'Fixture Anime English',
    title_japanese: 'フィクスチャー',
    title_synonyms: ['Fixture Synonym'],
    synopsis: 'A complete synopsis.',
    episodes: 12,
    score: 8.2,
    status: 'Finished Airing',
    season: 'winter',
    year: 2025,
    genres: [{ mal_id: 1, name: 'Action' }],
    studios: [{ mal_id: 2, name: 'Example Studio' }],
    images: {
      jpg: {
        image_url: 'https://example.test/poster.jpg',
        large_image_url: 'https://example.test/poster-large.jpg',
      },
      webp: {
        image_url: 'https://example.test/poster.webp',
        large_image_url: 'https://example.test/poster-large.webp',
      },
    },
    trailer: {
      images: {
        large_image_url: 'https://example.test/hero-large.jpg',
        maximum_image_url: 'https://example.test/hero-maximum.jpg',
      },
    },
    ...overrides,
  };
}

describe('Jikan anime mapper', () => {
  it('maps a complete current Jikan anime response', () => {
    expect(isJikanSingleAnimeResponse(animeFullFixture)).toBe(true);
    if (!isJikanSingleAnimeResponse(animeFullFixture)) {
      throw new Error('The static Jikan fixture is invalid.');
    }
    expect(mapJikanAnime(animeFullFixture.data, 'details')).toMatchObject({
      id: 1,
      title: 'Cowboy Bebop',
      alternativeTitles: ['カウボーイビバップ', 'Space Cowboy'],
      totalEpisodes: 26,
      score: 8.75,
      season: 'Spring',
      year: 1998,
      genres: ['Action', 'Sci-Fi'],
      studios: ['Sunrise'],
      largePosterImageUrl: 'https://example.test/cowboy-large.webp',
      posterImageUrl: 'https://example.test/cowboy.webp',
      heroImageUrl: 'https://example.test/trailer-maximum.jpg',
      continuity: [
        { animeId: 400, title: 'Bebop Origins', kind: 'prequel' },
        { animeId: 5, title: 'Cowboy Bebop: The Movie', kind: 'sequel' },
      ],
    });
  });

  it('does not expose continuity from summary payloads', () => {
    expect(mapJikanAnime(animeFullFixture.data).continuity).toEqual([]);
  });

  it('uses safe defaults for nullable metadata and empty arrays', () => {
    const mapped = mapJikanAnime(
      completeDto({
        episodes: null,
        synopsis: null,
        studios: [],
        title_english: null,
        title_japanese: null,
        title_synonyms: [],
      }),
    );
    expect(mapped.totalEpisodes).toBeNull();
    expect(mapped.synopsis).toBe('No synopsis is available for this anime.');
    expect(mapped.studios).toEqual([]);
    expect(mapped.alternativeTitles).toEqual([]);
  });

  it('prefers WebP poster images and trailer hero artwork', () => {
    const mapped = mapJikanAnime(completeDto());
    expect(mapped.posterImageUrl).toBe('https://example.test/poster.webp');
    expect(mapped.largePosterImageUrl).toBe(
      'https://example.test/poster-large.webp',
    );
    expect(mapped.heroImageUrl).toBe('https://example.test/hero-maximum.jpg');
  });

  it('falls back to JPEG artwork and then the large poster for the hero', () => {
    const mapped = mapJikanAnime(
      completeDto({
        images: {
          webp: null,
          jpg: {
            image_url: 'https://example.test/fallback.jpg',
            large_image_url: 'https://example.test/fallback-large.jpg',
          },
        },
        trailer: null,
      }),
    );
    expect(mapped.posterImageUrl).toBe('https://example.test/fallback.jpg');
    expect(mapped.largePosterImageUrl).toBe(
      'https://example.test/fallback-large.jpg',
    );
    expect(mapped.heroImageUrl).toBe('https://example.test/fallback-large.jpg');
  });

  it('generates stable fallback seeds from the MAL ID', () => {
    expect(createAnimeFallbackSeeds(42)).toEqual(createAnimeFallbackSeeds(42));
    expect(createAnimeFallbackSeeds(42)).not.toEqual(
      createAnimeFallbackSeeds(43),
    );
  });

  it('deduplicates and removes empty alternative titles', () => {
    const mapped = mapJikanAnime(
      completeDto({
        title: 'Primary',
        title_english: ' Primary ',
        title_japanese: 'Japanese',
        title_synonyms: ['japanese', ' Synonym ', '', 'synonym'],
      }),
    );
    expect(mapped.alternativeTitles).toEqual(['Japanese', 'Synonym']);
  });
});
