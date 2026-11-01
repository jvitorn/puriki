import {
  buildRecommendationSeeds,
  rankLocalRecommendationCandidates,
  selectRecommendationSeedEntries,
} from '@/domain/rules/anime-recommendations';
import {
  makeAnime,
  makeUnifiedAnime,
  makeUserAnimeEntry,
} from '@/tests/builders/anime-builder';

describe('anime recommendations', () => {
  it('selects positive completed and meaningfully watched entries as seeds', () => {
    const entries = [
      makeUserAnimeEntry({
        animeId: 1,
        status: 'completed',
        userScore: 9,
      }),
      makeUserAnimeEntry({
        animeId: 2,
        status: 'completed',
        userScore: 5,
      }),
      makeUserAnimeEntry({
        animeId: 3,
        status: 'watching',
        watchedEpisodes: 6,
      }),
      makeUserAnimeEntry({ animeId: 4, status: 'plan_to_watch' }),
    ];

    expect(
      selectRecommendationSeedEntries(entries).map(({ animeId }) => animeId),
    ).toEqual([1, 3]);
  });

  it('weights completed ratings and sufficiently advanced watching progress', () => {
    const completed = makeUnifiedAnime(
      { id: 1 },
      { status: 'completed', watchedEpisodes: 12, userScore: 10 },
    );
    const watching = makeUnifiedAnime(
      { id: 2, totalEpisodes: 12 },
      { status: 'watching', watchedEpisodes: 6, userScore: null },
    );
    const early = makeUnifiedAnime(
      { id: 3, totalEpisodes: 12 },
      { status: 'watching', watchedEpisodes: 2, userScore: null },
    );

    expect(buildRecommendationSeeds([completed, watching, early])).toEqual([
      { animeId: 1, weight: 1 },
      { animeId: 2, weight: 0.55 },
    ]);
  });

  it('ranks matching genres and studios while excluding seed titles', () => {
    const seedAnime = makeAnime({
      id: 1,
      genres: ['Action', 'Fantasy'],
      studios: ['Bones'],
      year: 2020,
    });
    const closeMatch = makeAnime({
      id: 2,
      genres: ['Action', 'Fantasy'],
      studios: ['Bones'],
      year: 2021,
      score: 8,
    });
    const distant = makeAnime({
      id: 3,
      genres: ['Romance'],
      studios: ['Other'],
      year: 1990,
      score: 9,
    });

    expect(
      rankLocalRecommendationCandidates(
        [{ anime: seedAnime, seed: { animeId: 1, weight: 1 } }],
        [seedAnime, distant, closeMatch],
        10,
      ).map(({ id }) => id),
    ).toEqual([2, 3]);
  });
});
