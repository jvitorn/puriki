import { selectPersonalizedPopularAnime } from '@/domain/rules/anime-discovery';
import { makeAnime, makeUserAnimeEntry } from '@/tests/builders/anime-builder';

describe('personalized popular anime', () => {
  it('excludes only completed titles while preserving candidate order', () => {
    const watching = makeAnime({ id: 1, title: 'Watching' });
    const completed = makeAnime({ id: 2, title: 'Completed' });
    const nextPopular = makeAnime({ id: 3, title: 'Next popular' });
    const userEntries = [
      makeUserAnimeEntry({ animeId: watching.id, status: 'watching' }),
      makeUserAnimeEntry({ animeId: completed.id, status: 'completed' }),
      makeUserAnimeEntry({ animeId: 99, status: 'completed' }),
    ];

    const result = selectPersonalizedPopularAnime(
      [watching, completed, nextPopular],
      userEntries,
    );

    expect(result.map((item) => item.anime.id)).toEqual([1, 3]);
    expect(result[0]?.userEntry).toEqual(userEntries[0]);
    expect(result[1]?.userEntry).toBeUndefined();
  });
});
