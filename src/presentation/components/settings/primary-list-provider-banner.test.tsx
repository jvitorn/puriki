import { act, fireEvent, screen } from '@testing-library/react-native';

import { PrimaryListProviderBanner } from '@/presentation/components/settings/primary-list-provider-banner';
import { renderWithProviders } from '@/tests/render/test-render';

describe('PrimaryListProviderBanner', () => {
  it('renders the notice and both provider buttons', async () => {
    await renderWithProviders(
      <PrimaryListProviderBanner onSelect={jest.fn()} />,
    );
    expect(screen.getByText('Choose your primary list')).toBeVisible();
    expect(screen.getByLabelText('Use AniList')).toBeVisible();
    expect(screen.getByLabelText('Use MyAnimeList')).toBeVisible();
  });

  it('calls onSelect with the chosen provider', async () => {
    const onSelect = jest.fn();
    await renderWithProviders(
      <PrimaryListProviderBanner onSelect={onSelect} />,
    );
    await fireEvent.press(screen.getByLabelText('Use MyAnimeList'));
    expect(onSelect).toHaveBeenCalledWith('mal');
  });

  it('disables both buttons while a selection is pending', async () => {
    let resolveSelect: (() => void) | undefined;
    const onSelect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSelect = resolve;
        }),
    );
    await renderWithProviders(
      <PrimaryListProviderBanner onSelect={onSelect} />,
    );
    await fireEvent.press(screen.getByLabelText('Use AniList'));
    expect(screen.getByLabelText('Use AniList')).toBeDisabled();
    expect(screen.getByLabelText('Use MyAnimeList')).toBeDisabled();
    await act(async () => resolveSelect?.());
  });
});
