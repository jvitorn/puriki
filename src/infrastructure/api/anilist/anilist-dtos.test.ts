import {
  aniListDisplayTitle,
  parseAniListCombinedHomeData,
  parseAniListDetailsData,
  parseAniListMediaDetails,
  parseAniListMediaSummary,
  parseAniListPageData,
} from '@/infrastructure/api/anilist/anilist-dtos';
import {
  anilistDetailsPayload,
  anilistPage,
  anilistSummary,
} from '@/infrastructure/api/anilist/anilist-test-fixtures';

describe('AniList DTO validation', () => {
  it('parses summary fields while preserving documented nullable values', () => {
    const parsed = parseAniListMediaSummary(
      anilistSummary({
        idMal: null,
        episodes: null,
        bannerImage: null,
        coverImage: {
          extraLarge: null,
          large: null,
          medium: null,
          color: null,
        },
      }),
    );
    expect(parsed).toMatchObject({
      id: 30_013,
      idMal: null,
      episodes: null,
      bannerImage: null,
      coverImage: { extraLarge: null },
    });
    expect(aniListDisplayTitle(parsed)).toBe('One Piece');
  });

  it('parses rich details, main studios, relation version 2 and airing data', () => {
    const parsed = parseAniListDetailsData({ Media: anilistDetailsPayload() });
    expect(parsed.studios).toEqual([{ id: 18, name: 'Toei Animation' }]);
    expect(parsed.relations[0]).toMatchObject({
      relationType: 'SEQUEL',
      id: 1_663_708,
    });
    expect(parsed.nextAiringEpisode).toEqual({
      episode: 1_151,
      airingAt: 1_800_000_000,
    });
  });

  it('accepts optional detail blocks as null without fabricating content', () => {
    const parsed = parseAniListMediaDetails({
      ...anilistSummary(),
      synonyms: null,
      description: null,
      studios: null,
      relations: null,
      nextAiringEpisode: null,
    });
    expect(parsed).toMatchObject({
      synonyms: [],
      description: null,
      studios: [],
      relations: [],
      nextAiringEpisode: null,
    });
  });

  it('validates Page and combined aliases', () => {
    const page = anilistPage([anilistSummary()], 2);
    expect(parseAniListPageData(page)).toMatchObject({
      media: [{ id: 30_013 }],
      pageInfo: { currentPage: 2, hasNextPage: true, lastPage: 5 },
    });
    expect(
      parseAniListCombinedHomeData({
        popular: { media: [anilistSummary()] },
        seasonal: { media: [anilistSummary({ id: 2 })] },
        upcoming: { media: [anilistSummary({ id: 3 })] },
      }),
    ).toMatchObject({
      popular: [{ id: 30_013 }],
      seasonal: [{ id: 2 }],
      upcoming: [{ id: 3 }],
    });
  });

  it.each([
    [null, 'invalid media object'],
    [{ ...anilistSummary(), id: 'bad' }, 'invalid media ID'],
    [{ ...anilistSummary(), title: null }, 'invalid media title'],
    [{ ...anilistSummary(), coverImage: 'bad' }, 'invalid cover image'],
  ])('rejects malformed summary %#', (value, message) => {
    expect(() => parseAniListMediaSummary(value)).toThrow(message);
  });

  it.each([
    [{}, parseAniListPageData, 'invalid Page response'],
    [
      { Page: { media: null } },
      parseAniListPageData,
      'invalid media collection',
    ],
    [{}, parseAniListDetailsData, 'no details media'],
    [{}, parseAniListCombinedHomeData, 'no popular catalog section'],
  ] as const)('rejects malformed envelope %#', (value, parser, message) => {
    expect(() => parser(value)).toThrow(message);
  });
});
