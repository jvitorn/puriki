import { fireEvent, screen } from '@testing-library/react-native';

import { AnimeCard } from '@/presentation/components/anime/anime-card';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeCard', () => {
  it('shows anime information and deterministic progress artwork', async () => {
    await renderWithProviders(
      <AnimeCard item={buildWatchingAnime()} onPress={jest.fn()} />,
    );
    expect(screen.getByText('Test Horizon')).toBeVisible();
    expect(screen.getByText('4 / 12')).toBeVisible();
    expect(screen.getByTestId('poster-42')).toBeVisible();
    expect(
      screen.getByLabelText('Poster placeholder for Test Horizon'),
    ).toBeVisible();
  });

  it('invokes its navigation callback', async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <AnimeCard item={buildWatchingAnime()} onPress={onPress} />,
    );
    await fireEvent.press(screen.getByLabelText('Open Test Horizon'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
