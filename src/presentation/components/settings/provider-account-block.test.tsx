import { fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import AniListIcon from '../../../../assets/providers/anilist.png';
import MyAnimeListIcon from '../../../../assets/providers/myanimelist.png';

import { ProviderAccountBlock } from '@/presentation/components/settings/provider-account-block';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';
import { renderWithProviders } from '@/tests/render/test-render';

function connectedSnapshot(provider: 'anilist' | 'mal') {
  return {
    state: 'connected' as const,
    account: {
      provider,
      userId: '42',
      username: 'aiko',
      avatarUrl: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
    },
    operation: 'idle' as const,
    failure: null,
    canRetry: false,
  };
}

describe('ProviderAccountBlock', () => {
  it.each(['anilist', 'mal'] as const)(
    'signs in using bare labels for %s when suffixing is not requested',
    async (provider) => {
      const authSession = new TestAuthSessionController();
      const signIn = jest.spyOn(authSession, 'signIn');
      await renderWithProviders(
        <ProviderAccountBlock
          provider={provider}
          providerImage={provider === 'anilist' ? AniListIcon : MyAnimeListIcon}
          providerName={provider === 'anilist' ? 'AniList' : 'MyAnimeList'}
        />,
        { authSession },
      );
      await fireEvent.press(screen.getByLabelText('Connect'));
      expect(signIn).toHaveBeenCalledWith(provider);
    },
  );

  it('suffixes accessibility labels with the provider name when requested', async () => {
    const authSession = new TestAuthSessionController();
    await renderWithProviders(
      <ProviderAccountBlock
        provider="mal"
        providerImage={MyAnimeListIcon}
        providerName="MyAnimeList"
        suffixAccessibilityLabels
      />,
      { authSession },
    );
    expect(screen.getByLabelText('Connect MyAnimeList')).toBeVisible();
    expect(screen.queryByLabelText('Connect')).not.toBeOnTheScreen();
  });

  it('confirms disconnect with a provider-specific alert', async () => {
    const authSession = new TestAuthSessionController();
    authSession.updateConnection('mal', connectedSnapshot('mal'));
    const signOut = jest.spyOn(authSession, 'signOut');
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    await renderWithProviders(
      <ProviderAccountBlock
        provider="mal"
        providerImage={MyAnimeListIcon}
        providerName="MyAnimeList"
        suffixAccessibilityLabels
      />,
      { authSession },
    );
    await fireEvent.press(screen.getByLabelText('Disconnect MyAnimeList'));
    expect(alert).toHaveBeenCalledWith(
      'Disconnect MyAnimeList?',
      expect.stringContaining('MyAnimeList session'),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    expect(signOut).toHaveBeenCalledWith('mal');
    alert.mockRestore();
  });

  it('shows a provider-specific failure message', async () => {
    const authSession = new TestAuthSessionController();
    authSession.updateConnection('mal', {
      state: 'reconnect_required',
      account: null,
      operation: 'idle',
      failure: 'network',
      canRetry: false,
    });
    await renderWithProviders(
      <ProviderAccountBlock
        provider="mal"
        providerImage={MyAnimeListIcon}
        providerName="MyAnimeList"
        suffixAccessibilityLabels
      />,
      { authSession },
    );
    expect(
      screen.getByText(
        'Unable to verify the MyAnimeList account. Check your connection and try again.',
      ),
    ).toBeVisible();
  });
});
