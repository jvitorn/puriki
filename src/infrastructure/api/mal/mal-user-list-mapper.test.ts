import {
  mapDomainScoreToRaw,
  mapMalUserListEntry,
} from '@/infrastructure/api/mal/mal-user-list-mapper';

describe('mapMalUserListEntry', () => {
  it('maps a DTO to the domain UserAnimeEntry shape', () => {
    expect(
      mapMalUserListEntry(21, {
        status: 'watching',
        score: 7,
        numEpisodesWatched: 50,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      animeId: 21,
      status: 'watching',
      watchedEpisodes: 50,
      userScore: 7,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it("maps MyAnimeList's unscored 0 to a null domain score", () => {
    const entry = mapMalUserListEntry(21, {
      status: 'plan_to_watch',
      score: 0,
      numEpisodesWatched: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(entry.userScore).toBeNull();
  });

  it('rejects a score outside the 1-10 range', () => {
    expect(() =>
      mapMalUserListEntry(21, {
        status: 'watching',
        score: 11,
        numEpisodesWatched: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });

  it('rejects an unrecognized status', () => {
    expect(() =>
      mapMalUserListEntry(21, {
        status: 'rewatching',
        score: 0,
        numEpisodesWatched: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('mapDomainScoreToRaw', () => {
  it('round-trips through mapMalUserListEntry', () => {
    expect(mapDomainScoreToRaw(null)).toBe(0);
    expect(mapDomainScoreToRaw(7)).toBe(7);
    const entry = mapMalUserListEntry(1, {
      status: 'watching',
      score: mapDomainScoreToRaw(9),
      numEpisodesWatched: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(entry.userScore).toBe(9);
  });
});
