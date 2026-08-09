import { parseAniListMediaDetails } from '@/infrastructure/api/anilist/anilist-dtos';
import {
  mapAniListDetails,
  mapAniListSummary,
} from '@/infrastructure/api/anilist/anilist-mapper';
import {
  anilistDetailsPayload,
  anilistSummary,
} from '@/infrastructure/api/anilist/anilist-test-fixtures';

describe('AniList mapper', () => {
  it('keeps MAL identity and maps summary fields with intentional image roles', () => {
    expect(
      mapAniListSummary(
        anilistSummary({
          title: { english: 'English', romaji: 'Romaji', native: 'Native' },
          coverImage: {
            large: 'large',
            medium: 'medium',
            extraLarge: 'extra',
            color: null,
          },
          bannerImage: null,
        }),
      ),
    ).toMatchObject({
      id: 21,
      title: 'English',
      alternativeTitles: ['Romaji', 'Native'],
      score: 8.8,
      season: 'Fall',
      year: 1999,
      airingStatus: 'Currently Airing',
      posterImageUrl: 'large',
      largePosterImageUrl: 'extra',
      heroImageUrl: null,
      synopsis: '',
      studios: [],
      continuity: [],
    });
  });

  it('skips media without a valid MAL ID', () => {
    expect(mapAniListSummary(anilistSummary({ idMal: null }))).toBeNull();
    expect(mapAniListSummary(anilistSummary({ idMal: 0 }))).toBeNull();
  });

  it('maps details, unique synonyms and only valid anime continuity', () => {
    const details = parseAniListMediaDetails(
      anilistDetailsPayload({
        title: { english: 'English', romaji: 'Romaji', native: 'Native' },
        synonyms: ['English', 'Alias', 'alias'],
        relations: {
          edges: [
            {
              relationType: 'SEQUEL',
              node: {
                id: 100,
                idMal: 22,
                type: 'ANIME',
                title: { english: 'Sequel', romaji: null, native: null },
                coverImage: { medium: null },
              },
            },
            {
              relationType: 'PREQUEL',
              node: {
                id: 101,
                idMal: 20,
                type: 'ANIME',
                title: { english: null, romaji: 'Prequel', native: null },
                coverImage: { medium: null },
              },
            },
            {
              relationType: 'SEQUEL',
              node: {
                id: 102,
                idMal: null,
                type: 'ANIME',
                title: { english: 'No MAL', romaji: null, native: null },
                coverImage: { medium: null },
              },
            },
            {
              relationType: 'PREQUEL',
              node: {
                id: 103,
                idMal: 20,
                type: 'MANGA',
                title: { english: 'Manga', romaji: null, native: null },
                coverImage: { medium: null },
              },
            },
          ],
        },
      }),
    );

    expect(mapAniListDetails(details)).toMatchObject({
      alternativeTitles: ['Romaji', 'Native', 'Alias'],
      synopsis: 'A pirate adventure.',
      studios: ['Toei Animation'],
      continuity: [
        { animeId: 20, title: 'Prequel', kind: 'prequel' },
        { animeId: 22, title: 'Sequel', kind: 'sequel' },
      ],
    });
  });

  it('maps nullable and unknown values without fabricating media', () => {
    expect(
      mapAniListSummary(
        anilistSummary({
          episodes: 0,
          averageScore: 101,
          season: 'UNKNOWN',
          seasonYear: null,
          status: 'UNKNOWN',
          coverImage: {
            large: null,
            medium: 'medium',
            extraLarge: null,
            color: null,
          },
        }),
      ),
    ).toMatchObject({
      totalEpisodes: null,
      score: null,
      season: null,
      year: null,
      airingStatus: 'Status Unknown',
      posterImageUrl: 'medium',
      largePosterImageUrl: 'medium',
    });
  });
});
