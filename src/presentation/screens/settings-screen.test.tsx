import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import type { ProviderSessionSnapshot } from '@/application/auth/auth-contracts';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import type { DeveloperSettingsStorage } from '@/infrastructure/storage/developer-settings-storage';
import { SettingsScreen } from '@/presentation/screens/settings-screen';
import {
  createTestAuthSession,
  type TestAuthSessionController,
} from '@/tests/auth/test-auth-session';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

jest.mock('@/infrastructure/api/mal/mal-diagnostics', () => ({
  runMalConnectivityDiagnostic: jest.fn(),
}));

const aboutDescription =
  'A modern anime list client designed for focused, everyday tracking.';

const malSuccess = {
  ok: true,
  platform: 'android',
  status: 200,
  elapsedMs: 420,
  errorKind: 'none' as const,
  message: 'MyAnimeList API is operational.',
  sampleAnimeTitle: 'Sousou no Frieren',
};

const anilistSuccess = {
  results: ['details', 'search', 'popular', 'seasonal', 'upcoming'].map(
    (testName) => ({
      testName: testName as
        'details' | 'search' | 'popular' | 'seasonal' | 'upcoming',
      ok: true,
      skipped: false,
      status: 200,
      elapsedMs: 210,
      responseBytes: 100,
      rateLimit: {
        limit: 30,
        remaining: 25,
        retryAfterSeconds: null,
        resetAt: null,
      },
      errorKind: 'none' as const,
      graphqlErrors: [],
      message: 'AniList operation responded successfully.',
      resultCount: 1,
      sampleTitle: null,
      sampleAniListId: null,
      sampleMalId: null,
      pageInfo: null,
      media: null,
      mediaItems: [],
      sectionCounts: null,
      compatibility: null,
      requestCount: 1,
    }),
  ),
  summary: {
    passed: 5,
    total: 5,
    averageLatencyMs: 210,
    slowestTest: 'details' as const,
    totalResponseBytes: 500,
    requestsMade: 5,
    startingRemaining: 29,
    endingRemaining: 25,
    rateLimitResponses: 0,
    stoppedByRateLimit: false,
  },
};

function createDeveloperStorage(
  initialValue = false,
): DeveloperSettingsStorage & {
  getDeveloperToolsEnabled: jest.Mock;
  setDeveloperToolsEnabled: jest.Mock;
} {
  let enabled = initialValue;
  return {
    getDeveloperToolsEnabled: jest.fn(async () => enabled),
    setDeveloperToolsEnabled: jest.fn(async (next: boolean) => {
      enabled = next;
    }),
  };
}

function createDiagnosticDependencies() {
  const dependencies = createTestDependencies();
  dependencies.runAniListDiagnostic = jest.fn(async () => anilistSuccess);
  return dependencies;
}

function createSettingsAuthSession(
  overrides: Partial<ProviderSessionSnapshot> = {},
): TestAuthSessionController {
  const authSession = createTestAuthSession();
  authSession.updateConnection('anilist', {
    state: 'disconnected',
    account: null,
    operation: 'idle',
    failure: null,
    canRetry: false,
    ...overrides,
  });
  return authSession;
}

async function tapAbout(times = 5) {
  for (let index = 0; index < times; index += 1) {
    await fireEvent.press(screen.getByText(aboutDescription));
  }
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.mocked(runMalConnectivityDiagnostic).mockResolvedValue(malSuccess);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('shows the compact Account, Preferences, and About experience', async () => {
    const storage = createDeveloperStorage();
    await renderWithProviders(
      <SettingsScreen
        developerStorage={storage}
        versionReader={() => '2.4.1'}
      />,
    );

    expect(screen.getByText('Account')).toBeVisible();
    expect(screen.getByText('AniList')).toBeVisible();
    expect(screen.getByText('MyAnimeList')).toBeVisible();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByText('Coming soon')).toBeVisible();
    expect(screen.getAllByTestId('account-avatar-fallback')).toHaveLength(2);
    expect(screen.getByLabelText('Connect')).toBeVisible();
    expect(screen.getByText('Language')).toBeVisible();
    expect(screen.getByText('Preferences')).toBeVisible();
    expect(screen.getByText('Theme')).toBeVisible();
    expect(screen.getByText('Dark')).toBeVisible();
    expect(screen.getByText('About')).toBeVisible();
    expect(screen.getByText('Version 2.4.1')).toBeVisible();
    expect(screen.queryByText('Data source')).not.toBeOnTheScreen();
    expect(screen.queryByText('Session / Storage')).not.toBeOnTheScreen();
    expect(screen.queryByText('Developer tools')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Test AniList API')).not.toBeOnTheScreen();
  });

  it('connects and reconnects AniList without exposing MAL actions', async () => {
    const disconnected = createSettingsAuthSession();
    const signIn = jest.spyOn(disconnected, 'signIn');
    const firstRendered = await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { authSession: disconnected },
    );
    await fireEvent.press(screen.getByLabelText('Connect'));
    expect(signIn).toHaveBeenCalledWith('anilist');
    expect(
      screen.queryByLabelText('Connect MyAnimeList'),
    ).not.toBeOnTheScreen();
    await firstRendered.unmount();

    const reconnect = createSettingsAuthSession({
      state: 'reconnect_required',
      failure: 'invalid_token',
    });
    const reconnectSignIn = jest.spyOn(reconnect, 'signIn');
    const rendered = await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { authSession: reconnect },
    );
    expect(screen.getByText('Reconnection required')).toBeVisible();
    expect(
      screen.getByText('The AniList session is no longer valid.'),
    ).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Reconnect'));
    expect(reconnectSignIn).toHaveBeenCalledWith('anilist');
    await rendered.unmount();
  });

  it('retries transient Viewer validation without reopening OAuth', async () => {
    const authSession = createSettingsAuthSession({
      failure: 'network',
      canRetry: true,
    });
    const retry = jest.spyOn(authSession, 'retry');
    const signIn = jest.spyOn(authSession, 'signIn');
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { authSession },
    );

    expect(
      screen.getByText(
        "We couldn't verify this account. Try again when the service is available.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Unable to verify the AniList account. Check your connection and try again.',
      ),
    ).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Try again'));
    expect(retry).toHaveBeenCalledWith('anilist');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('confirms logout and preserves catalog dependencies', async () => {
    const authSession = createSettingsAuthSession({
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'aiko',
        avatarUrl: null,
        expiresAt: '2027-08-16T12:00:00.000Z',
      },
    });
    const signOut = jest.spyOn(authSession, 'signOut');
    const dependencies = createTestDependencies();
    const clearCatalog = jest.spyOn(dependencies, 'clearCatalogCache');
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { authSession, dependencies },
    );

    expect(screen.getByText('aiko')).toBeVisible();
    expect(screen.getByText('Connected with AniList')).toBeVisible();
    expect(screen.getByText('Active')).toBeVisible();
    await fireEvent.press(screen.getByLabelText('Disconnect'));
    expect(alert).toHaveBeenCalledWith(
      'Disconnect AniList?',
      expect.stringContaining('catalog and local data will be kept'),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0]?.[2];
    buttons?.find((button) => button.style === 'destructive')?.onPress?.();
    expect(signOut).toHaveBeenCalledWith('anilist');
    expect(clearCatalog).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('disables account actions while an auth operation is active', async () => {
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      {
        authSession: createSettingsAuthSession({ operation: 'signing_in' }),
      },
    );
    expect(screen.getByLabelText('Connecting…')).toBeDisabled();
  });

  it('supports System default as the selected language preference', async () => {
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { languagePreference: 'system' },
    );
    await fireEvent.press(screen.getByLabelText('Language'));
    expect(
      screen.getByLabelText('System default').props.accessibilityState,
    ).toMatchObject({ checked: true });
    expect(screen.getByText('Settings')).toBeVisible();
  });

  it('keeps runtime subscriptions and diagnostics unmounted before unlock', async () => {
    const dependencies = createDiagnosticDependencies();
    const subscribe = jest.spyOn(dependencies, 'subscribeCatalogRuntimeStatus');
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { dependencies },
    );

    expect(subscribe).not.toHaveBeenCalled();
    expect(dependencies.runAniListDiagnostic).not.toHaveBeenCalled();
    expect(runMalConnectivityDiagnostic).not.toHaveBeenCalled();
  });

  it('unlocks developer tools on the fifth About tap with progressive feedback', async () => {
    const storage = createDeveloperStorage();
    const dependencies = createDiagnosticDependencies();
    await renderWithProviders(<SettingsScreen developerStorage={storage} />, {
      dependencies,
    });

    await tapAbout(3);
    expect(screen.getByText('2 taps away from Developer Tools')).toBeVisible();
    await tapAbout(1);
    expect(screen.getByText('1 tap away from Developer Tools')).toBeVisible();
    await tapAbout(1);

    expect(screen.getByText('Developer tools')).toBeVisible();
    expect(screen.getByLabelText('Test AniList API')).toBeVisible();
    expect(screen.getByLabelText('Test MyAnimeList API')).toBeVisible();
    expect(storage.setDeveloperToolsEnabled).toHaveBeenCalledWith(true);
  });

  it('resets an incomplete unlock sequence after three seconds', async () => {
    jest.useFakeTimers();
    const storage = createDeveloperStorage();
    await renderWithProviders(<SettingsScreen developerStorage={storage} />);

    await tapAbout(3);
    expect(screen.getByText('2 taps away from Developer Tools')).toBeVisible();
    await act(async () => jest.advanceTimersByTimeAsync(3_001));
    expect(
      screen.queryByText('2 taps away from Developer Tools'),
    ).not.toBeOnTheScreen();
    await tapAbout(2);
    expect(screen.queryByText('Developer tools')).not.toBeOnTheScreen();
    expect(storage.setDeveloperToolsEnabled).not.toHaveBeenCalled();
  });

  it('restores and disables the persisted developer preference', async () => {
    const storage = createDeveloperStorage(true);
    await renderWithProviders(
      <SettingsScreen
        developerStorage={storage}
        versionReader={() => '3.0.0'}
      />,
      { dependencies: createDiagnosticDependencies() },
    );

    await waitFor(() =>
      expect(screen.getByText('Developer tools')).toBeVisible(),
    );
    expect(screen.getAllByText('Version 3.0.0')).toHaveLength(2);
    await fireEvent.press(screen.getByText('Disable Developer Tools'));

    await waitFor(() =>
      expect(screen.queryByText('Developer tools')).not.toBeOnTheScreen(),
    );
    expect(storage.setDeveloperToolsEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByText('Account')).toBeVisible();
    expect(screen.getByText('Language')).toBeVisible();
    expect(screen.getByText('About')).toBeVisible();
  });

  it('renders catalog status and maintenance actions only after unlock', async () => {
    const dependencies = createDiagnosticDependencies();
    dependencies.emitCatalogRuntimeStatus({
      ...dependencies.getCatalogRuntimeStatus(),
      primaryHealth: 'degraded',
      operations: {
        ...dependencies.getCatalogRuntimeStatus().operations,
        popular: {
          circuitState: 'open',
          lastSuccessfulSource: 'mal',
          lastFallbackAt: '2026-08-06T12:00:00.000Z',
        },
      },
    });
    dependencies.resetPrimaryCircuits = jest.fn();
    dependencies.clearCatalogCache = jest.fn();
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies },
    );

    await waitFor(() =>
      expect(screen.getByText('AniList: Degraded')).toBeVisible(),
    );
    expect(screen.getByText('Circuit: open')).toBeVisible();
    expect(
      screen.getByText('AniList failed, so MyAnimeList data is being used.'),
    ).toBeVisible();
    await fireEvent.press(screen.getByText('Reset AniList circuit states'));
    await fireEvent.press(screen.getByText('Clear catalog cache'));
    expect(dependencies.resetPrimaryCircuits).toHaveBeenCalledTimes(1);
    expect(dependencies.clearCatalogCache).toHaveBeenCalledTimes(1);
  });

  it('runs MAL directly and renders an accessible success result', async () => {
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies: createDiagnosticDependencies() },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Test MyAnimeList API')).toBeVisible(),
    );
    await fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));

    await waitFor(() =>
      expect(screen.getByText('MyAnimeList API is operational.')).toBeVisible(),
    );
    expect(runMalConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(screen.getByText('HTTP 200 • 420 ms')).toBeVisible();
    expect(screen.getByText('Sample result: Sousou no Frieren')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
  });

  it('prevents duplicate and concurrent diagnostics while one is pending', async () => {
    let resolveDiagnostic: ((value: typeof malSuccess) => void) | undefined;
    jest.mocked(runMalConnectivityDiagnostic).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDiagnostic = resolve;
        }),
    );
    const dependencies = createDiagnosticDependencies();
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Test MyAnimeList API')).toBeVisible(),
    );

    await fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));
    await waitFor(() =>
      expect(screen.getByLabelText('Testing MyAnimeList API…')).toBeDisabled(),
    );
    await fireEvent.press(screen.getByLabelText('Testing MyAnimeList API…'));
    await fireEvent.press(screen.getByLabelText('Test AniList API'));
    expect(runMalConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(dependencies.runAniListDiagnostic).not.toHaveBeenCalled();
    resolveDiagnostic?.(malSuccess);
    await waitFor(() =>
      expect(screen.getByText('MyAnimeList API is operational.')).toBeVisible(),
    );
  });

  it('keeps the AniList direct diagnostic independent from MAL', async () => {
    const dependencies = createDiagnosticDependencies();
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Test AniList API')).toBeVisible(),
    );
    await fireEvent.press(screen.getByLabelText('Test AniList API'));

    await waitFor(() =>
      expect(
        screen.getByText('AniList: 5 of 5 checks operational'),
      ).toBeVisible(),
    );
    expect(dependencies.runAniListDiagnostic).toHaveBeenCalledTimes(1);
    expect(runMalConnectivityDiagnostic).not.toHaveBeenCalled();
    expect(screen.getAllByText(/200.*210 ms.*25/)).toHaveLength(5);
  });

  it('switches and persists language without resetting queries or repositories', async () => {
    const dependencies = createTestDependencies();
    const getPopular = jest.spyOn(dependencies.catalogRepository, 'getPopular');
    const { queryClient } = await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { dependencies },
    );
    const resetQueries = jest.spyOn(queryClient, 'resetQueries');
    const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');

    expect(screen.getByText('Puriki')).toBeVisible();

    await fireEvent.press(screen.getByLabelText('Language'));
    await fireEvent.press(screen.getByLabelText('Português (Brasil)'));
    await waitFor(() =>
      expect(screen.getByText('Configurações')).toBeVisible(),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'purikuki:language-preference:v1',
      'pt-BR',
    );
    await fireEvent.press(screen.getByLabelText('Idioma'));
    await fireEvent.press(screen.getByLabelText('Español'));
    await waitFor(() =>
      expect(screen.getByText('Configuración')).toBeVisible(),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'purikuki:language-preference:v1',
      'es',
    );

    expect(resetQueries).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
    expect(getPopular).not.toHaveBeenCalled();
  });
});
