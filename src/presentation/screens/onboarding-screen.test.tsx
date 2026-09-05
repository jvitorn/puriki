import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import {
  OnboardingHeroPosters,
  pickOnboardingPosters,
} from '@/presentation/components/onboarding/onboarding-hero-posters';
import { OnboardingContent } from '@/presentation/screens/onboarding-screen';
import { createTestAuthSession } from '@/tests/auth/test-auth-session';
import { buildTestAnimeDataset } from '@/tests/fixtures/anime-dataset';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

describe('pickOnboardingPosters', () => {
  it('returns three distinct poster candidates without depending on fixed IDs', () => {
    const items = buildTestAnimeDataset()
      .catalog.slice(0, 8)
      .map((anime) => ({
        ...anime,
        posterImageUrl: `https://example.com/${anime.id}.jpg`,
      }));
    const selected = pickOnboardingPosters(items, () => 0.4);

    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((anime) => anime.id)).size).toBe(3);
    expect(selected.every((anime) => anime.posterImageUrl)).toBe(true);
  });

  it('keeps its selection stable for the same mounted composition', async () => {
    const items = buildTestAnimeDataset()
      .catalog.slice(0, 8)
      .map((anime) => ({
        ...anime,
        posterImageUrl: `https://example.com/${anime.id}.jpg`,
      }));
    const random = jest.fn(() => 0.4);
    const { rerender } = await renderWithProviders(
      <OnboardingHeroPosters items={items} isLoading={false} random={random} />,
    );
    const callsAfterSelection = random.mock.calls.length;

    rerender(
      <OnboardingHeroPosters
        items={[...items].reverse()}
        isLoading={false}
        random={random}
      />,
    );

    expect(callsAfterSelection).toBeGreaterThan(0);
    expect(random).toHaveBeenCalledTimes(callsAfterSelection);
  });
});

describe('OnboardingContent', () => {
  async function moveToProviders() {
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
  }

  it('keeps welcome copy and its CTA usable while posters are loading', async () => {
    const dependencies = createTestDependencies();
    let resolvePopular: (() => void) | undefined;
    jest.spyOn(dependencies.catalogRepository, 'getPopular').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePopular = () => resolve([]);
        }),
    );

    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { dependencies },
    );

    expect(
      screen.getByText('Your anime. Your lists. One place.'),
    ).toBeVisible();
    expect(screen.getByText('Get started')).toBeVisible();
    expect(screen.getAllByLabelText('Loading content')).toHaveLength(3);

    await act(async () => resolvePopular?.());
    await waitFor(() => expect(screen.getByTestId('poster-0')).toBeVisible());
  });

  it('falls back to three poster placeholders without showing catalog errors', async () => {
    const dependencies = createTestDependencies();
    jest
      .spyOn(dependencies.catalogRepository, 'getPopular')
      .mockRejectedValueOnce(new Error('catalog unavailable'));

    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { dependencies },
    );

    await waitFor(() => expect(screen.getByTestId('poster-0')).toBeVisible());
    expect(screen.getByTestId('poster-1')).toBeVisible();
    expect(screen.getByTestId('poster-2')).toBeVisible();
    expect(screen.queryByText('catalog unavailable')).not.toBeOnTheScreen();
  });

  it('advances through every act and keeps progress interactions local', async () => {
    const completeOnboarding = jest.fn(async () => undefined);
    const authSession = createTestAuthSession();
    const signIn = jest.spyOn(authSession, 'signIn');
    await renderWithProviders(
      <OnboardingContent completeOnboarding={completeOnboarding} />,
      { authSession },
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));
    expect(screen.getByTestId('learn-act')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByLabelText('Increase watched episodes'));
    expect(screen.getByText('14')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('providers-act')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('AniList'));
    expect(signIn).toHaveBeenCalledWith('anilist');
    expect(completeOnboarding).not.toHaveBeenCalled();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Continue without an account' }),
    );
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('treats AniList and MyAnimeList as equally real, selectable providers', async () => {
    const authSession = createTestAuthSession();
    const signIn = jest.spyOn(authSession, 'signIn');
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { authSession },
    );

    await moveToProviders();

    expect(screen.getByLabelText('AniList')).toBeEnabled();
    expect(screen.getByLabelText('MyAnimeList')).toBeEnabled();
    expect(screen.queryByText('Coming soon')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('MyAnimeList'));
    expect(signIn).toHaveBeenCalledWith('mal');
  });

  it('shows AniList as connected without disabling MyAnimeList', async () => {
    const completeOnboarding = jest.fn(async () => undefined);
    const authSession = createTestAuthSession();
    authSession.updateConnection('anilist', {
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'aiko',
        avatarUrl: null,
        expiresAt: '2027-08-16T12:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={completeOnboarding} />,
      { authSession },
    );

    await moveToProviders();
    expect(screen.getByText('Connected as aiko')).toBeVisible();
    expect(
      screen.getByLabelText('AniList').props.accessibilityState,
    ).toMatchObject({ disabled: true, selected: true });
    expect(screen.getByLabelText('MyAnimeList')).toBeEnabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('shows MyAnimeList as connected and lets the user continue', async () => {
    const completeOnboarding = jest.fn(async () => undefined);
    const authSession = createTestAuthSession();
    authSession.updateConnection('mal', {
      state: 'connected',
      account: {
        provider: 'mal',
        userId: '7',
        username: 'kenji',
        avatarUrl: null,
        expiresAt: '2027-08-16T12:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={completeOnboarding} />,
      { authSession },
    );

    await moveToProviders();
    expect(screen.getByText('Connected as kenji')).toBeVisible();
    expect(
      screen.getByLabelText('MyAnimeList').props.accessibilityState,
    ).toMatchObject({ disabled: true, selected: true });
    expect(
      screen.queryByRole('button', { name: 'Continue without an account' }),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('shows AniList sign-in as unconfigured instead of a generic failure', async () => {
    const authSession = createTestAuthSession();
    authSession.updateConnection('anilist', {
      state: 'disconnected',
      account: null,
      operation: 'idle',
      failure: 'configuration',
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { authSession },
    );

    await moveToProviders();
    expect(
      screen.getByText('AniList sign-in is not configured for this build.'),
    ).toBeVisible();
  });

  it('shows MyAnimeList sign-in as unconfigured instead of "coming soon"', async () => {
    const authSession = createTestAuthSession();
    authSession.updateConnection('mal', {
      state: 'disconnected',
      account: null,
      operation: 'idle',
      failure: 'configuration',
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { authSession },
    );

    await moveToProviders();
    expect(
      screen.getByText('MyAnimeList sign-in is not configured for this build.'),
    ).toBeVisible();
    expect(screen.queryByText('Coming soon')).not.toBeOnTheScreen();
  });

  it('shows a validated AniList account before explicitly completing onboarding', async () => {
    const completeOnboarding = jest.fn(async () => undefined);
    const authSession = createTestAuthSession();
    authSession.updateConnection('anilist', {
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'aiko',
        avatarUrl: null,
        expiresAt: '2027-08-16T12:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={completeOnboarding} />,
      { authSession },
    );

    await moveToProviders();
    expect(screen.getByText('Connected as aiko')).toBeVisible();
    expect(
      screen.getByLabelText('AniList').props.accessibilityState,
    ).toMatchObject({ disabled: true, selected: true });
    expect(
      screen.queryByRole('button', { name: 'Continue without an account' }),
    ).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('retries transient Viewer validation without opening OAuth', async () => {
    const authSession = createTestAuthSession();
    authSession.updateConnection('anilist', {
      state: 'disconnected',
      account: null,
      operation: 'idle',
      failure: 'network',
      canRetry: true,
    });
    const retry = jest.spyOn(authSession, 'retry');
    const signIn = jest.spyOn(authSession, 'signIn');
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { authSession },
    );

    await moveToProviders();
    expect(
      screen.getByText(
        'Unable to verify the AniList account. Check your connection and try again.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Try again')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('AniList'));
    expect(retry).toHaveBeenCalledWith('anilist');
    expect(signIn).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Continue without an account' }),
    ).toBeVisible();
  });

  it('keeps provider and guest actions disabled during an OAuth operation', async () => {
    const authSession = createTestAuthSession();
    authSession.updateConnection('anilist', {
      state: 'disconnected',
      account: null,
      operation: 'signing_in',
      failure: null,
      canRetry: false,
    });
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
      { authSession },
    );

    await moveToProviders();
    expect(screen.getByLabelText('AniList')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Continue without an account' }),
    ).toBeDisabled();
  });

  it('supports swipe progress and back navigation across acts', async () => {
    await renderWithProviders(
      <OnboardingContent completeOnboarding={jest.fn(async () => undefined)} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

    await fireEvent(
      screen.getByTestId('onboarding-carousel'),
      'onMomentumScrollEnd',
      {
        nativeEvent: {
          contentOffset: { x: Dimensions.get('window').width * 2, y: 0 },
        },
      },
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByTestId('providers-act')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(screen.getByTestId('learn-act')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Go back'));
    await fireEvent.press(screen.getByLabelText('Go back'));
    await fireEvent.press(screen.getByLabelText('Go back'));
    expect(screen.getByTestId('welcome-act')).toBeVisible();
  });
});
