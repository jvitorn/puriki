import { parseAniListMediaDetails } from '@/infrastructure/api/anilist/anilist-dtos';
import {
  mapAniListAiringStatus,
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
      airingStatus: 'releasing',
      posterImageUrl: 'large',
      largePosterImageUrl: 'extra',
      heroImageUrl: null,
      synopsis: '',
      studios: [],
      continuity: [],
      streamingServices: [],
    });
  });

  it('skips media without a valid MAL ID', () => {
    expect(mapAniListSummary(anilistSummary({ idMal: null }))).toBeNull();
    expect(mapAniListSummary(anilistSummary({ idMal: 0 }))).toBeNull();
  });

  it('derives released episodes from the next AniList airing episode', () => {
    expect(
      mapAniListSummary(
        anilistSummary({
          episodes: 12,
          status: 'RELEASING',
          nextAiringEpisode: { episode: 5 },
        }),
      ),
    ).toMatchObject({ totalEpisodes: 12, releasedEpisodes: 4 });
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
        externalLinks: [
          {
            site: 'Crunchyroll',
            type: 'STREAMING',
            icon: 'https://example.test/crunchyroll.png',
            isDisabled: false,
          },
          {
            site: ' crunchyroll ',
            type: 'STREAMING',
            icon: 'https://example.test/duplicate.png',
            isDisabled: false,
          },
          {
            site: 'Netflix',
            type: 'STREAMING',
            icon: 'javascript:unsafe',
            isDisabled: null,
          },
          {
            site: 'Official Site',
            type: 'INFO',
            icon: 'https://example.test/info.png',
            isDisabled: false,
          },
          {
            site: 'Disabled Stream',
            type: 'STREAMING',
            icon: null,
            isDisabled: true,
          },
        ],
      }),
    );

    expect(mapAniListDetails(details)).toMatchObject({
      alternativeTitles: ['Romaji', 'Native', 'Alias'],
      synopsis: 'A pirate adventure.',
      releasedEpisodes: 1150,
      studios: ['Toei Animation'],
      continuity: [
        { animeId: 20, title: 'Prequel', kind: 'prequel' },
        { animeId: 22, title: 'Sequel', kind: 'sequel' },
      ],
      streamingServices: [
        {
          name: 'Crunchyroll',
          iconUrl: 'https://example.test/crunchyroll.png',
        },
        { name: 'Netflix', iconUrl: null },
      ],
    });
  });

  it('normalizes <br> markup in the description into plain line breaks', () => {
    const details = parseAniListMediaDetails(
      anilistDetailsPayload({
        description:
          "It's been years since the crew set sail.<br><br>(Source: Crunchyroll)",
      }),
    );
    expect(mapAniListDetails(details)?.synopsis).toBe(
      "It's been years since the crew set sail.\n\n(Source: Crunchyroll)",
    );
  });

  it('keeps missing or malformed external-link data out of the domain model', () => {
    const details = parseAniListMediaDetails(
      anilistDetailsPayload({
        externalLinks: [
          null,
          { site: 42, type: 'STREAMING' },
          { site: 'No type' },
        ],
      }),
    );
    expect(mapAniListDetails(details)?.streamingServices).toEqual([]);
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
      airingStatus: 'unknown',
      posterImageUrl: 'medium',
      largePosterImageUrl: 'medium',
    });
  });

  it.each([
    ['RELEASING', 'releasing'],
    ['FINISHED', 'finished'],
    ['NOT_YET_RELEASED', 'not_yet_released'],
    ['CANCELLED', 'cancelled'],
    ['HIATUS', 'hiatus'],
    ['UNKNOWN', 'unknown'],
    [null, 'unknown'],
  ] as const)('maps airing status %s to %s', (remote, expected) => {
    expect(mapAniListAiringStatus(remote)).toBe(expected);
  });
});
