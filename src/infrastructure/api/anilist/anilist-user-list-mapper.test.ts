import { parseAniListUserListChunk } from '@/infrastructure/api/anilist/anilist-user-list-dtos';
import { mapAniListUserListEntry } from '@/infrastructure/api/anilist/anilist-user-list-mapper';

function dto(overrides: Record<string, unknown> = {}) {
  return {
    mediaId: 101,
    status: 'CURRENT',
    score: 8,
    progress: 4,
    updatedAt: 1_700_000_000,
    media: { idMal: 202 },
    ...overrides,
  };
}

describe('AniList user list DTOs and mapper', () => {
  it.each([
    ['CURRENT', 'watching'],
    ['REPEATING', 'watching'],
    ['COMPLETED', 'completed'],
    ['PAUSED', 'on_hold'],
    ['DROPPED', 'dropped'],
    ['PLANNING', 'plan_to_watch'],
  ] as const)('maps %s to %s', (remoteStatus, domainStatus) => {
    const parsed = parseAniListUserListChunk({
      MediaListCollection: {
        hasNextChunk: false,
        lists: [{ entries: [dto({ status: remoteStatus })] }],
      },
    });

    expect(mapAniListUserListEntry(parsed.entries[0]!)).toEqual({
      mediaId: 101,
      entry: {
        animeId: 202,
        status: domainStatus,
        watchedEpisodes: 4,
        userScore: 8,
        updatedAt: '2023-11-14T22:13:20.000Z',
      },
    });
  });

  it('maps zero and absent scores to null and absent progress to zero', () => {
    const parsed = parseAniListUserListChunk({
      MediaListCollection: {
        hasNextChunk: false,
        lists: [
          {
            entries: [
              dto({ score: 0, progress: null }),
              dto({ mediaId: 102, score: null, media: { idMal: 203 } }),
            ],
          },
        ],
      },
    });

    expect(mapAniListUserListEntry(parsed.entries[0]!)?.entry).toMatchObject({
      watchedEpisodes: 0,
      userScore: null,
    });
    expect(
      mapAniListUserListEntry(parsed.entries[1]!)?.entry.userScore,
    ).toBeNull();
  });

  it('skips entries without a MAL identifier', () => {
    const parsed = parseAniListUserListChunk({
      MediaListCollection: {
        hasNextChunk: false,
        lists: [{ entries: [dto({ media: { idMal: null } })] }],
      },
    });
    expect(mapAniListUserListEntry(parsed.entries[0]!)).toBeNull();
  });

  it.each([
    [dto({ status: 'UNKNOWN' }), 'unknown list status'],
    [dto({ score: 7.5 }), 'POINT_10'],
    [dto({ progress: -1 }), 'episode progress'],
    [dto({ updatedAt: -1 }), 'timestamp'],
  ])('rejects invalid mapped values', (entry, message) => {
    const parsed = parseAniListUserListChunk({
      MediaListCollection: {
        hasNextChunk: false,
        lists: [{ entries: [entry] }],
      },
    });
    expect(() => mapAniListUserListEntry(parsed.entries[0]!)).toThrow(message);
  });

  it('rejects malformed collection shapes and identifiers', () => {
    expect(() => parseAniListUserListChunk({})).toThrow('collection');
    expect(() =>
      parseAniListUserListChunk({
        MediaListCollection: {
          hasNextChunk: false,
          lists: [{ entries: [dto({ mediaId: 0 })] }],
        },
      }),
    ).toThrow('media list entry');
  });
});
