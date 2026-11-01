import { getRecommendedFeaturedAnime } from '@/application/use-cases/get-recommended-featured-anime';
import { CatalogUnavailableError } from '@/domain/errors/catalog-error';
import type { AnimeRecommendationSeed } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import { makeAnime, makeUserAnimeEntry } from '@/tests/builders/anime-builder';

describe('getRecommendedFeaturedAnime', () => {
  const featured = makeAnime({ id: 1, title: 'Generic featured' });
  const seed = makeAnime({ id: 2, title: 'Completed favorite' });
  const recommendation = makeAnime({ id: 3, title: 'Personalized pick' });

  function dependencies(
    entries = [
      makeUserAnimeEntry({
        animeId: seed.id,
        status: 'completed',
        watchedEpisodes: 12,
        userScore: 9,
      }),
    ],
  ) {
    const catalogRepository = {
      getFeatured: jest.fn(async () => featured),
      getManyByIds: jest.fn(async () => [seed]),
      getRecommendations: jest.fn(
        async (_seeds: readonly AnimeRecommendationSeed[], _limit: number) => [
          seed,
          recommendation,
        ],
      ),
    } satisfies Pick<
      AnimeCatalogRepository,
      'getFeatured' | 'getManyByIds' | 'getRecommendations'
    >;
    const userListRepository = {
      getPage: jest.fn(async () => ({
        items: entries,
        page: 1,
        nextPage: null,
        totalCount: entries.length,
      })),
    } satisfies Pick<UserAnimeListRepository, 'getPage'>;
    return { catalogRepository, userListRepository };
  }

  it('returns a recommendation that is not already in the user list', async () => {
    const deps = dependencies();

    await expect(getRecommendedFeaturedAnime(deps)).resolves.toEqual({
      anime: recommendation,
      personalized: true,
    });
    const [seeds, limit] =
      deps.catalogRepository.getRecommendations.mock.calls[0] ?? [];
    expect(seeds).toEqual([
      expect.objectContaining({ animeId: seed.id, weight: expect.any(Number) }),
    ]);
    expect(seeds?.[0]?.weight).toBeCloseTo(0.955);
    expect(limit).toBe(20);
  });

  it('keeps generic Featured for a cold-start user', async () => {
    const deps = dependencies([]);

    await expect(getRecommendedFeaturedAnime(deps)).resolves.toEqual({
      anime: featured,
      personalized: false,
    });
    expect(deps.catalogRepository.getRecommendations).not.toHaveBeenCalled();
  });

  it('falls back to generic Featured when recommendation sources fail', async () => {
    const deps = dependencies();
    deps.catalogRepository.getRecommendations.mockRejectedValueOnce(
      new CatalogUnavailableError(),
    );

    await expect(getRecommendedFeaturedAnime(deps)).resolves.toEqual({
      anime: featured,
      personalized: false,
    });
  });
});
