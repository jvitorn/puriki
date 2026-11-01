import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  AniListNetworkError,
  AniListServiceUnavailableError,
} from '@/infrastructure/api/anilist/anilist-errors';
import { HomeScreen } from '@/presentation/screens/home-screen';
import {
  buildWatchingAnime,
  makeAnime,
  makeUserAnimeEntry,
} from '@/tests/builders/anime-builder';
import { buildUserListDataset } from '@/tests/fixtures/anime-dataset';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

describe('HomeScreen partial failures', () => {
  it('requests only a bounded first page for Continue Watching', async () => {
    const dependencies = createTestDependencies(
      buildUserListDataset({ size: 200, status: 'watching' }),
    );
    const getPage = jest.spyOn(dependencies.userListRepository, 'getPage');
    await renderWithProviders(<HomeScreen />, { dependencies });
    await waitFor(() =>
      expect(screen.getByText('Continue Watching')).toBeVisible(),
    );
    expect(screen.getByLabelText('Puriki')).toBeVisible();
    expect(screen.queryByText('PURIKI')).not.toBeOnTheScreen();
    expect(
      getPage.mock.calls.filter(([request]) => request.status === 'watching'),
    ).toEqual([[{ page: 1, pageSize: 10, status: 'watching' }]]);
  });

  it('replaces completed popular titles with the next candidates', async () => {
    const featured = makeAnime({ id: 501, title: 'Featured title' });
    const completed = makeAnime({ id: 502, title: 'Completed popular' });
    const replacement = makeAnime({ id: 503, title: 'Replacement popular' });
    const dependencies = createTestDependencies({
      catalog: [featured, completed, replacement],
      userEntries: [
        makeUserAnimeEntry({
          animeId: completed.id,
          status: 'completed',
          watchedEpisodes: 12,
        }),
      ],
    });

    await renderWithProviders(<HomeScreen />, { dependencies });

    await waitFor(() =>
      expect(screen.getByText('Replacement popular')).toBeVisible(),
    );
    expect(screen.queryByText('Completed popular')).not.toBeOnTheScreen();
  });

  it('labels a personalized recommendation separately from generic Featured', async () => {
    const seed = makeAnime({ id: 601, title: 'Favorite seed' });
    const recommendation = makeAnime({
      id: 602,
      title: 'Personalized recommendation',
    });
    const dependencies = createTestDependencies({
      catalog: [recommendation, seed],
      userEntries: [
        makeUserAnimeEntry({
          animeId: seed.id,
          status: 'completed',
          watchedEpisodes: 12,
          userScore: 9,
        }),
      ],
    });

    await renderWithProviders(<HomeScreen />, { dependencies });

    await waitFor(() =>
      expect(screen.getByText('Recommended for you')).toBeVisible(),
    );
    expect(screen.queryByText('Featured')).not.toBeOnTheScreen();
  });

  it('keeps successful rails visible when an optional rail fails', async () => {
    const dependencies = createTestDependencies();
    dependencies.catalogRepository.getPopular = jest.fn(async () =>
      Promise.reject(new AniListNetworkError()),
    );
    const { queryClient } = await renderWithProviders(<HomeScreen />, {
      dependencies,
    });
    await waitFor(() => {
      expect(screen.getByText('Popular Now')).toBeVisible();
      expect(
        screen.getByText(
          'Unable to reach the anime catalog. Check your connection and try again.',
        ),
      ).toBeVisible();
    });
    expect(screen.getByText('This Season')).toBeVisible();
    expect(screen.getByText('Upcoming')).toBeVisible();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('retries only the failed rail from its section action', async () => {
    const dependencies = createTestDependencies();
    const recovered = buildWatchingAnime({
      id: 777,
      title: 'Recovered Rail',
    }).anime;
    dependencies.catalogRepository.getPopular = jest
      .fn()
      .mockRejectedValueOnce(new AniListNetworkError())
      .mockResolvedValueOnce([recovered]);
    const { queryClient } = await renderWithProviders(<HomeScreen />, {
      dependencies,
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Retry Popular Now')).toBeVisible(),
    );
    await act(async () => {
      fireEvent.press(screen.getByLabelText('Retry Popular Now'));
    });
    await waitFor(() =>
      expect(screen.getByText('Recovered Rail')).toBeVisible(),
    );
    expect(dependencies.catalogRepository.getPopular).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('uses available catalog content when the featured request fails', async () => {
    const dependencies = createTestDependencies();
    const fallback = buildWatchingAnime({
      id: 778,
      title: 'Rail Fallback',
    }).anime;
    dependencies.catalogRepository.getFeatured = jest.fn(async () =>
      Promise.reject(new AniListServiceUnavailableError(504)),
    );
    dependencies.catalogRepository.getPopular = jest.fn(async () => [fallback]);
    const { queryClient } = await renderWithProviders(<HomeScreen />, {
      dependencies,
    });
    await waitFor(() =>
      expect(screen.getAllByText('Rail Fallback')).not.toHaveLength(0),
    );
    expect(screen.queryByText('Unable to load')).not.toBeOnTheScreen();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });

  it('shows the global error only when no usable catalog content exists', async () => {
    const dependencies = createTestDependencies();
    const unavailable = new AniListServiceUnavailableError(504);
    dependencies.catalogRepository.getFeatured = jest.fn(async () =>
      Promise.reject(unavailable),
    );
    dependencies.catalogRepository.getPopular = jest.fn(async () =>
      Promise.reject(unavailable),
    );
    dependencies.catalogRepository.getSeasonal = jest.fn(async () =>
      Promise.reject(unavailable),
    );
    dependencies.catalogRepository.getUpcoming = jest.fn(async () =>
      Promise.reject(unavailable),
    );
    dependencies.catalogRepository.getManyByIds = jest.fn(async () =>
      Promise.reject(unavailable),
    );
    const { queryClient } = await renderWithProviders(<HomeScreen />, {
      dependencies,
    });
    await waitFor(() =>
      expect(screen.getByText('Unable to load')).toBeVisible(),
    );
    expect(
      screen.getByText('The anime catalog is temporarily unavailable.'),
    ).toBeVisible();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });
});
