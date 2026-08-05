import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { AnimeDetailsScreen } from '@/presentation/screens/anime-details-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeDetailsScreen', () => {
  it('displays domain data and updates progress and status', async () => {
    await renderWithProviders(<AnimeDetailsScreen animeId={1} />);
    await waitFor(() =>
      expect(screen.getByText('Moonlit Vanguard')).toBeVisible(),
    );
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
      expect(screen.getByLabelText('Score 10')).toHaveProp(
        'accessibilityState',
        { selected: true, disabled: false },
      ),
    );
    await fireEvent.press(screen.getByLabelText('Clear score'));
    await waitFor(() =>
      expect(screen.getByLabelText('Clear score')).toHaveProp(
        'accessibilityState',
        { selected: true, disabled: false },
      ),
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
});
