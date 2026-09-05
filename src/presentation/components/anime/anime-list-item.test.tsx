import { screen } from '@testing-library/react-native';

import { AnimeListItem } from '@/presentation/components/anime/anime-list-item';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeListItem', () => {
  it('never presents list progress above the known episode count', async () => {
    const item = buildWatchingAnime({
      totalEpisodes: 12,
      releasedEpisodes: 4,
      airingStatus: 'releasing',
    });
    item.userEntry!.watchedEpisodes = 20;
    await renderWithProviders(
      <AnimeListItem item={item} onPress={jest.fn()} />,
    );

    expect(screen.getByText('4 / 12 episodes')).toBeVisible();
    expect(screen.getByLabelText('Episode progress')).toHaveAccessibilityValue({
      min: 0,
      max: 100,
      now: 33,
    });
  });
});
