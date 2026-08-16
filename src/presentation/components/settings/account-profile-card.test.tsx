import { screen } from '@testing-library/react-native';

import { AccountProfileCard } from '@/presentation/components/settings/account-profile-card';
import { renderWithProviders } from '@/tests/render/test-render';

describe('AccountProfileCard', () => {
  it('renders a truthful disconnected shell without invented identity data', async () => {
    await renderWithProviders(
      <AccountProfileCard
        connectionState="disconnected"
        providerName="AniList"
        status="Not connected"
      />,
    );

    expect(screen.getByText('AniList')).toBeVisible();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByTestId('account-avatar-fallback')).toBeVisible();
    expect(screen.queryByText('@guest')).not.toBeOnTheScreen();
  });

  it('supports future connected profile data and a remote avatar', async () => {
    await renderWithProviders(
      <AccountProfileCard
        avatarUrl="https://cdn.example.com/avatar.png"
        connectionState="connected"
        providerName="AniList"
        status="Connected as aiko"
        username="aiko"
      />,
    );

    expect(screen.getByText('AniList')).toBeVisible();
    expect(screen.getByText('Connected as aiko')).toBeVisible();
    expect(screen.getByLabelText('Profile picture for aiko')).toBeVisible();
  });
});
