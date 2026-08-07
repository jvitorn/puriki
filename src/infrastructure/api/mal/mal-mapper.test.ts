import animeDetailFixture from '@/infrastructure/api/mal/fixtures/anime-detail.json';
import type { MalAnimeDto } from '@/infrastructure/api/mal/mal-dtos';
import { mapMalAnime } from '@/infrastructure/api/mal/mal-mapper';

function completeDto(overrides: Partial<MalAnimeDto> = {}): MalAnimeDto {
  return {
    id: 42,
    title: 'Primary Title',
    main_picture: {
      medium: 'https://example.test/medium.jpg',
      large: 'https://example.test/large.jpg',
    },
    alternative_titles: {
      en: 'English Title',
      ja: '日本語タイトル',
      synonyms: ['Synonym'],
    },
    synopsis: 'Complete synopsis.',
    mean: 8.5,
    genres: [{ id: 1, name: 'Action' }],
    studios: [{ id: 2, name: 'Example Studio' }],
    num_episodes: 12,
    status: 'currently_airing',
    start_season: { year: 2026, season: 'summer' },
    ...overrides,
  };
}

describe('MAL anime mapper', () => {
  it('maps the complete official-catalog fixture into the provider-neutral model', () => {
    const mapped = mapMalAnime(animeDetailFixture);
    expect(mapped).toMatchObject({
      id: 52991,
      title: 'Sousou no Frieren',
      alternativeTitles: [
        "Frieren: Beyond Journey's End",
        '葬送のフリーレン',
        'Frieren at the Funeral',
      ],
      synopsis:
        'An elf retraces the journey she once shared with her companions.',
      genres: ['Adventure', 'Fantasy'],
      studios: ['Madhouse'],
      totalEpisodes: 28,
      score: 9.28,
      season: 'Fall',
      year: 2023,
      airingStatus: 'Finished Airing',
      posterImageUrl: 'https://example.test/frieren-medium.jpg',
      largePosterImageUrl: 'https://example.test/frieren-large.jpg',
      heroImageUrl: 'https://example.test/frieren-large.jpg',
    });
  });

  it('uses safe nullable values when optional metadata is missing', () => {
    const mapped = mapMalAnime({ id: 7, title: 'Minimal' });
    expect(mapped).toMatchObject({
      alternativeTitles: [],
      synopsis: '',
      genres: [],
      studios: [],
      totalEpisodes: null,
      score: null,
      season: null,
      year: null,
      airingStatus: 'Status unknown',
      posterImageUrl: null,
      largePosterImageUrl: null,
      heroImageUrl: null,
    });
  });

  it('uses a large-only picture as every artwork fallback', () => {
    const mapped = mapMalAnime(
      completeDto({
        main_picture: { large: 'https://example.test/large-only.jpg' },
      }),
    );
    expect(mapped.posterImageUrl).toBe('https://example.test/large-only.jpg');
    expect(mapped.largePosterImageUrl).toBe(
      'https://example.test/large-only.jpg',
    );
    expect(mapped.heroImageUrl).toBe('https://example.test/large-only.jpg');
  });

  it('uses a medium-only picture when no large picture is available', () => {
    const mapped = mapMalAnime(
      completeDto({
        main_picture: { medium: 'https://example.test/medium-only.jpg' },
      }),
    );
    expect(mapped.posterImageUrl).toBe('https://example.test/medium-only.jpg');
    expect(mapped.largePosterImageUrl).toBe(
      'https://example.test/medium-only.jpg',
    );
    expect(mapped.heroImageUrl).toBe('https://example.test/medium-only.jpg');
  });

  it('deduplicates blank, primary, and case-equivalent alternative titles', () => {
    const mapped = mapMalAnime(
      completeDto({
        title: 'Primary',
        alternative_titles: {
          en: ' primary ',
          ja: 'Japanese',
          synonyms: ['japanese', ' Synonym ', '', 'SYNONYM'],
        },
      }),
    );
    expect(mapped.alternativeTitles).toEqual(['Japanese', 'Synonym']);
  });

  it('maps zero episodes to unknown and keeps finite zero scores', () => {
    const mapped = mapMalAnime(completeDto({ mean: 0, num_episodes: 0 }));
    expect(mapped.totalEpisodes).toBeNull();
    expect(mapped.score).toBe(0);
  });

  it('generates deterministic ID-based seeds', () => {
    expect(mapMalAnime(completeDto({ id: 42 }))).toMatchObject(
      mapMalAnime(completeDto({ id: 42 })),
    );
    expect(mapMalAnime(completeDto({ id: 42 })).coverSeed).not.toBe(
      mapMalAnime(completeDto({ id: 43 })).coverSeed,
    );
  });
});
