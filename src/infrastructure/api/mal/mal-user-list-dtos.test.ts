import {
  isKnownMalStatus,
  parseMalSavedListStatus,
  parseMalUserListPage,
} from '@/infrastructure/api/mal/mal-user-list-dtos';

describe('parseMalUserListPage', () => {
  it('parses entries and the next offset from paging.next', () => {
    const page = parseMalUserListPage({
      data: [
        {
          node: { id: 21, title: 'One Piece' },
          list_status: {
            status: 'watching',
            score: 8,
            num_episodes_watched: 120,
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
      paging: {
        next: 'https://api.myanimelist.net/v2/users/@me/animelist?offset=100&limit=100',
      },
    });
    expect(page).toEqual({
      entries: [
        {
          animeId: 21,
          status: {
            status: 'watching',
            score: 8,
            numEpisodesWatched: 120,
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
      ],
      nextOffset: 100,
    });
  });

  it('returns a null next offset on the final page', () => {
    const page = parseMalUserListPage({ data: [], paging: {} });
    expect(page.nextOffset).toBeNull();
  });

  it('defaults missing optional status fields', () => {
    const page = parseMalUserListPage({
      data: [{ node: { id: 5 }, list_status: { status: 'plan_to_watch' } }],
    });
    expect(page.entries[0]?.status).toMatchObject({
      status: 'plan_to_watch',
      score: 0,
      numEpisodesWatched: 0,
    });
  });

  it('rejects a malformed page envelope', () => {
    expect(() => parseMalUserListPage({})).toThrow();
    expect(() => parseMalUserListPage({ data: [{}] })).toThrow();
    expect(() =>
      parseMalUserListPage({ data: [{ node: { id: 1 } }] }),
    ).toThrow();
  });
});

describe('parseMalSavedListStatus', () => {
  it('parses the raw saved list_status object', () => {
    expect(
      parseMalSavedListStatus({
        status: 'completed',
        score: 10,
        num_episodes_watched: 24,
        updated_at: '2026-02-02T00:00:00.000Z',
      }),
    ).toEqual({
      status: 'completed',
      score: 10,
      numEpisodesWatched: 24,
      updatedAt: '2026-02-02T00:00:00.000Z',
    });
  });

  it('rejects a malformed saved status', () => {
    expect(() => parseMalSavedListStatus({})).toThrow();
    expect(() => parseMalSavedListStatus(null)).toThrow();
  });
});

describe('isKnownMalStatus', () => {
  it('recognizes all five domain-aligned statuses', () => {
    expect(isKnownMalStatus('watching')).toBe(true);
    expect(isKnownMalStatus('completed')).toBe(true);
    expect(isKnownMalStatus('on_hold')).toBe(true);
    expect(isKnownMalStatus('dropped')).toBe(true);
    expect(isKnownMalStatus('plan_to_watch')).toBe(true);
  });

  it('rejects unknown statuses', () => {
    expect(isKnownMalStatus('rewatching')).toBe(false);
  });
});
