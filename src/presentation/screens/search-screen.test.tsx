import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { SearchScreen } from '@/presentation/screens/search-screen';
import { makeAnime } from '@/tests/builders/anime-builder';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('SearchScreen', () => {
  afterEach(() => jest.useRealTimers());

  it('searches title and alternative title, then shows empty results', async () => {
    jest.useFakeTimers();
    await renderWithProviders(<SearchScreen />);
    await act(async () => Promise.resolve());
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'Neon Ronin');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() => expect(screen.getByText('Neon Ronin')).toBeVisible());
    await waitFor(() => expect(screen.getByText('1 result')).toBeVisible());

    await fireEvent.changeText(input, 'Gekko no Senjin');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );

    await fireEvent.changeText(input, 'no such local anime');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() =>
      expect(screen.getByText('No anime found')).toBeVisible(),
    );
  });

  it('explains the minimum query length and clears entered text', async () => {
    await renderWithProviders(<SearchScreen />);
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'n');
    expect(
      screen.getByText('Type at least 2 characters to search'),
    ).toBeVisible();
    expect(screen.getByText('Keep typing')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Clear search'));
    expect(input).toHaveProp('value', '');
  });

  it('shows genre topics instead of initial anime suggestions', async () => {
    await renderWithProviders(<SearchScreen />);

    expect(screen.getByText('Browse by genre')).toBeVisible();
    await waitFor(() =>
      expect(screen.getByTestId('search-topics')).toBeVisible(),
    );
    expect(screen.getByLabelText('Browse Adventure anime')).toBeVisible();
    expect(screen.getByLabelText('Browse Fantasy anime')).toBeVisible();
    expect(screen.queryByTestId('search-results')).not.toBeOnTheScreen();
    expect(screen.queryByText('Ember Archive')).not.toBeOnTheScreen();
  });

  it('uses unique genre backgrounds and opens popular and new groups', async () => {
    const dependencies = createTestDependencies();
    const actionLead = makeAnime({
      id: 701,
      title: 'Action Lead',
      genres: ['Action', 'Fantasy'],
      heroImageUrl: 'https://example.com/action-lead.jpg',
    });
    const actionBackup = makeAnime({
      id: 702,
      title: 'Action Backup',
      genres: ['Action'],
      heroImageUrl: 'https://example.com/action-backup.jpg',
    });
    const comedyLead = makeAnime({
      id: 703,
      title: 'Comedy Lead',
      genres: ['Comedy'],
      heroImageUrl: 'https://example.com/comedy-lead.jpg',
    });
    dependencies.catalogRepository.getPopular = jest
      .fn()
      .mockResolvedValue([actionLead, actionBackup, comedyLead]);
    const popular = Array.from({ length: 20 }, (_, index) =>
      makeAnime({
        id: 800 + index,
        title: `Action Popular ${index + 1}`,
        genres: ['Action'],
      }),
    );
    const newReleases = Array.from({ length: 20 }, (_, index) =>
      makeAnime({
        id: 900 + index,
        title: `Action New ${index + 1}`,
        genres: ['Action'],
      }),
    );
    dependencies.catalogRepository.getGenreDiscovery = jest
      .fn()
      .mockResolvedValue({ popular, newReleases });
    await renderWithProviders(<SearchScreen />, { dependencies });

    await waitFor(() =>
      expect(screen.getByLabelText('Browse Action anime')).toBeVisible(),
    );
    expect(screen.getByTestId('genre-topic-Action-image')).toHaveProp(
      'source',
      {
        uri: 'https://example.com/action-backup.jpg',
      },
    );
    expect(screen.getByTestId('genre-topic-Fantasy-image')).toHaveProp(
      'source',
      { uri: 'https://example.com/action-lead.jpg' },
    );
    await fireEvent.press(screen.getByLabelText('Browse Action anime'));
    await waitFor(() =>
      expect(screen.getByText('Action Popular 1')).toBeVisible(),
    );
    expect(screen.getByText('Action')).toBeVisible();
    expect(screen.getByLabelText('Browse all genres')).toBeVisible();
    expect(screen.getByLabelText('Open anime search')).toBeVisible();
    expect(screen.queryByLabelText('Search anime')).not.toBeOnTheScreen();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText('Popular')).toBeVisible();
    expect(
      screen
        .getAllByText(/^(New|Popular)$/)
        .map((sectionTitle) => sectionTitle.props.children),
    ).toEqual(['New', 'Popular']);
    expect(screen.getByText('Action New 1')).toBeVisible();
    expect(
      dependencies.catalogRepository.getGenreDiscovery,
    ).toHaveBeenCalledWith('Action', 20);

    await fireEvent.press(screen.getByLabelText('Browse all genres'));
    expect(screen.getByTestId('search-topics')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Browse Action anime'));
    await waitFor(() => expect(screen.getByText('Action')).toBeVisible());
    await fireEvent.press(screen.getByLabelText('Open anime search'));
    expect(screen.getByLabelText('Search anime')).toHaveProp('autoFocus', true);
    expect(screen.getByLabelText('Close search')).toBeVisible();
    expect(screen.queryByText('Action')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Browse all genres')).not.toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Search anime'), 'Naruto');
    await fireEvent.press(screen.getByLabelText('Close search'));
    expect(screen.getByText('Action')).toBeVisible();
    expect(screen.queryByLabelText('Search anime')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Open anime search'));
    expect(screen.getByLabelText('Search anime')).toHaveProp('value', '');
  });

  it('uses topic-shaped skeletons while discovery content is loading', async () => {
    const dependencies = createTestDependencies();
    dependencies.catalogRepository.getPopular = jest.fn(
      () => new Promise(() => undefined),
    );
    await renderWithProviders(<SearchScreen />, { dependencies });

    expect(screen.getAllByLabelText('Loading content').length).toBeGreaterThan(
      1,
    );
  });

  it('shows a skeleton only after a valid debounced search starts', async () => {
    jest.useFakeTimers();
    const dependencies = createTestDependencies();
    const pending = deferred<ReturnType<typeof makeAnime>[]>();
    dependencies.catalogRepository.search = jest.fn(() => pending.promise);
    await renderWithProviders(<SearchScreen />, { dependencies });
    await act(async () => Promise.resolve());
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'N');
    expect(screen.getByText('Keep typing')).toBeVisible();
    await fireEvent.changeText(input, 'Naruto');
    expect(screen.queryByText('Searching…')).not.toBeOnTheScreen();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    expect(screen.getByText('Searching…')).toBeVisible();
    expect(screen.getAllByLabelText('Loading content').length).toBeGreaterThan(
      1,
    );

    await act(async () =>
      pending.resolve([makeAnime({ id: 501, title: 'Naruto' })]),
    );
    await waitFor(() => expect(screen.getByText('Naruto')).toBeVisible());
    expect(screen.getByText('1 result')).toBeVisible();
  });

  it('hides the previous term while the replacement search is loading', async () => {
    jest.useFakeTimers();
    const dependencies = createTestDependencies();
    const bleach = deferred<ReturnType<typeof makeAnime>[]>();
    dependencies.catalogRepository.search = jest.fn((query) =>
      query === 'naruto'
        ? Promise.resolve([makeAnime({ id: 601, title: 'Naruto' })])
        : bleach.promise,
    );
    await renderWithProviders(<SearchScreen />, { dependencies });
    await act(async () => Promise.resolve());
    const input = screen.getByLabelText('Search anime');

    await fireEvent.changeText(input, 'Naruto');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await waitFor(() => expect(screen.getByText('Naruto')).toBeVisible());

    await fireEvent.changeText(input, 'Bleach');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    expect(screen.getByText('Searching…')).toBeVisible();
    expect(screen.queryByText('Naruto')).not.toBeOnTheScreen();

    await act(async () =>
      bleach.resolve([makeAnime({ id: 602, title: 'Bleach' })]),
    );
    await waitFor(() => expect(screen.getByText('Bleach')).toBeVisible());
  });

  it('preserves the error state for a failed remote search', async () => {
    jest.useFakeTimers();
    const dependencies = createTestDependencies();
    const pending = deferred<ReturnType<typeof makeAnime>[]>();
    dependencies.catalogRepository.search = jest.fn(() => pending.promise);
    await renderWithProviders(<SearchScreen />, { dependencies });
    await act(async () => Promise.resolve());

    await fireEvent.changeText(screen.getByLabelText('Search anime'), 'Error');
    await act(async () => {
      await jest.advanceTimersByTimeAsync(260);
    });
    await act(async () => pending.reject(new Error('Search unavailable')));

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.getByText('Unable to load')).toBeVisible();
    expect(screen.getByText('Try again')).toBeVisible();
  });
});
