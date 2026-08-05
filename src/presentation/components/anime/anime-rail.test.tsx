import { fireEvent, screen } from '@testing-library/react-native';

import { AnimeRail } from '@/presentation/components/anime/anime-rail';
import { buildWatchingAnime } from '@/tests/builders/anime-builder';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AnimeRail', () => {
  it('renders a title and supplied anime cards', async () => {
    const item = buildWatchingAnime();
    const onPress = jest.fn();
    await renderWithProviders(
      <AnimeRail
        title="Continue Watching"
        items={[item]}
        onPressItem={onPress}
      />,
    );
    expect(screen.getByText('Continue Watching')).toBeVisible();
    expect(screen.getByText('Test Horizon')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Open Test Horizon'));
    expect(onPress).toHaveBeenCalledWith(item);
  });

  it('renders a useful empty collection state', async () => {
    await renderWithProviders(
      <AnimeRail
        title="Popular Now"
        items={[]}
        onPressItem={jest.fn()}
        emptyMessage="No popular anime."
      />,
    );
    expect(screen.getByText('Popular Now')).toBeVisible();
    expect(screen.getByText('No popular anime.')).toBeVisible();
  });
});
