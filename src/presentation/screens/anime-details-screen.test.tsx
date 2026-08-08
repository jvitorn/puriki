import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { createMockScenario } from '@/mocks/scenarios/mock-scenarios';
import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeDetailsScreen', () => {
  it('displays domain data and updates progress and status', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    expect(
      screen.queryByText('Gekko no Senjin • Moon Vanguard'),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Alternative titles'));
    expect(screen.getByText('Gekko no Senjin • Moon Vanguard')).toBeVisible();
    expect(screen.getByText('Synopsis')).toBeVisible();
    expect(screen.getByText('of 12 episodes')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    await waitFor(() =>
      expect(screen.getByLabelText('Episode progress: 2 of 12')).toBeVisible(),
    );
    await fireEvent.press(screen.getByText('Plan to Watch'));
    await waitFor(() =>
      expect(screen.getByLabelText('Episode progress: 0 of 12')).toBeVisible(),
    );
  });

  it('updates and clears a score', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    await fireEvent.press(screen.getByLabelText('Score 10'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Score 10').props.accessibilityState,
      ).toMatchObject({ selected: true, disabled: false }),
    );
    await fireEvent.press(screen.getByLabelText('Clear score'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Clear score').props.accessibilityState,
      ).toMatchObject({ selected: true, disabled: false }),
    );
  });

  it('rolls back and reports mutation errors accessibly', async () => {
    const dependencies = createTestDependencies();
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies,
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
    dependencies.setForceErrors(true);
    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(
      screen.getByText('Update failed. Your previous values were restored.'),
    ).toBeVisible();
    expect(screen.getByLabelText('Episode progress: 1 of 12')).toBeVisible();
  });

  it('handles a missing anime', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={999} />);
    await waitFor(() =>
      expect(screen.getByText('Anime not found')).toBeVisible(),
    );
  });

  it('starts a long synopsis collapsed and supports both disclosure actions', async () => {
    const dataset = createMockScenario('default');
    const first = dataset.catalog[0];
    if (!first) throw new Error('Expected a seeded anime.');
    dataset.catalog[0] = {
      ...first,
      synopsis: 'A long journey across a changing world. '.repeat(30),
    };
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies: createTestDependencies(dataset),
    });
    await waitFor(() => expect(screen.getByText('Synopsis')).toBeVisible());

    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
    await fireEvent.press(screen.getByLabelText('Read more'));
    await waitFor(() =>
      expect(screen.getByLabelText('Show less')).toBeVisible(),
    );
    expect(
      screen.getByLabelText('Synopsis').props.numberOfLines,
    ).toBeUndefined();
    await fireEvent.press(screen.getByLabelText('Show less'));
    expect(screen.getByLabelText('Synopsis')).toHaveProp('numberOfLines', 4);
  });

  it('renders missing optional metadata without empty disclosure sections', async () => {
    const dataset = createMockScenario('default');
    const first = dataset.catalog[0];
    if (!first) throw new Error('Expected a seeded anime.');
    dataset.catalog[0] = {
      ...first,
      alternativeTitles: [],
      genres: [],
      score: null,
      season: null,
      studios: [],
      synopsis: '',
      totalEpisodes: null,
      year: null,
    };
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />, {
      dependencies: createTestDependencies(dataset),
    });
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );

    expect(screen.queryByText('Synopsis')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Alternative titles')).not.toBeOnTheScreen();
    expect(screen.getByText('Episodes TBD')).toBeVisible();
    expect(screen.getAllByText('Unknown').length).toBeGreaterThan(0);
  });
});
