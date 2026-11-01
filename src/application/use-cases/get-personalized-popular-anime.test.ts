import { getPersonalizedPopularAnime } from '@/application/use-cases/get-personalized-popular-anime';
import type { PageResult } from '@/domain/models/pagination';
import { makeAnime, makeUserAnimeEntry } from '@/tests/builders/anime-builder';

describe('getPersonalizedPopularAnime', () => {
  it('reads every user-list page before filtering popular candidates', async () => {
    const completed = makeAnime({ id: 1, title: 'Completed popular' });
    const replacement = makeAnime({ id: 2, title: 'Replacement popular' });
    const pages: Record<
      number,
      PageResult<ReturnType<typeof makeUserAnimeEntry>>
    > = {
      1: {
        items: [makeUserAnimeEntry({ animeId: 99, status: 'watching' })],
        page: 1,
        nextPage: 2,
        totalCount: 2,
      },
      2: {
        items: [
          makeUserAnimeEntry({ animeId: completed.id, status: 'completed' }),
        ],
        page: 2,
        nextPage: null,
        totalCount: 2,
      },
    };
    const getPage = jest.fn(async ({ page }: { page: number }) => pages[page]!);

    const result = await getPersonalizedPopularAnime({
      catalogRepository: {
        getPopular: jest.fn(async () => [completed, replacement]),
      },
      userListRepository: { getPage },
    });

    expect(result.map((item) => item.anime.id)).toEqual([replacement.id]);
    expect(getPage).toHaveBeenNthCalledWith(1, { page: 1, pageSize: 100 });
    expect(getPage).toHaveBeenNthCalledWith(2, { page: 2, pageSize: 100 });
  });
});
