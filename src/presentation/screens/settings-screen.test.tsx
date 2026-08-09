import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import type { DeveloperSettingsStorage } from '@/infrastructure/storage/developer-settings-storage';
import { SettingsScreen } from '@/presentation/screens/settings-screen';
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

const jikanSuccess = {
  platform: 'android',
  health: 'healthy' as const,
  endpoints: ['details', 'popular', 'seasonal', 'upcoming', 'search'].map(
    (operation) => ({
      operation: operation as
        'details' | 'popular' | 'seasonal' | 'upcoming' | 'search',
      ok: true,
      status: 200,
      elapsedMs: 210,
      errorKind: 'none' as const,
      message: 'Jikan endpoint responded successfully.',
    }),
  ),
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
  dependencies.runJikanDiagnostic = jest.fn(async () => jikanSuccess);
  return dependencies;
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

  it('shows only Account, Language, and About in the public experience', async () => {
    const storage = createDeveloperStorage();
    await renderWithProviders(
      <SettingsScreen
        developerStorage={storage}
        versionReader={() => '2.4.1'}
      />,
    );

    expect(screen.getByText('Account')).toBeVisible();
    expect(screen.getByText('MyAnimeList')).toBeVisible();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByTestId('account-avatar-fallback')).toBeVisible();
    expect(screen.getByText('Language')).toBeVisible();
    expect(screen.getByText('About')).toBeVisible();
    expect(screen.getByText('Version 2.4.1')).toBeVisible();
    expect(screen.queryByText('Data source')).not.toBeOnTheScreen();
    expect(screen.queryByText('Session / Storage')).not.toBeOnTheScreen();
    expect(screen.queryByText('Developer tools')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Test Jikan API')).not.toBeOnTheScreen();
  });

  it('supports System default as the selected language preference', async () => {
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage()} />,
      { languagePreference: 'system' },
    );
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
    expect(dependencies.runJikanDiagnostic).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText('Test Jikan API')).toBeVisible();
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
      jikanHealth: 'degraded',
      operations: {
        ...dependencies.getCatalogRuntimeStatus().operations,
        popular: {
          circuitState: 'open',
          lastSuccessfulSource: 'mal',
          lastFallbackAt: '2026-08-06T12:00:00.000Z',
        },
      },
    });
    dependencies.resetJikanCircuits = jest.fn();
    dependencies.clearCatalogCache = jest.fn();
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies },
    );

    await waitFor(() =>
      expect(screen.getByText('Jikan: Degraded')).toBeVisible(),
    );
    expect(screen.getByText('Circuit: open')).toBeVisible();
    expect(
      screen.getByText('Jikan failed, so MyAnimeList data is being used.'),
    ).toBeVisible();
    await fireEvent.press(screen.getByText('Reset Jikan circuit states'));
    await fireEvent.press(screen.getByText('Clear catalog cache'));
    expect(dependencies.resetJikanCircuits).toHaveBeenCalledTimes(1);
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
    await fireEvent.press(screen.getByLabelText('Test Jikan API'));
    expect(runMalConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(dependencies.runJikanDiagnostic).not.toHaveBeenCalled();
    resolveDiagnostic?.(malSuccess);
    await waitFor(() =>
      expect(screen.getByText('MyAnimeList API is operational.')).toBeVisible(),
    );
  });

  it('keeps the Jikan direct diagnostic independent from MAL', async () => {
    const dependencies = createDiagnosticDependencies();
    await renderWithProviders(
      <SettingsScreen developerStorage={createDeveloperStorage(true)} />,
      { dependencies },
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Test Jikan API')).toBeVisible(),
    );
    await fireEvent.press(screen.getByLabelText('Test Jikan API'));

    await waitFor(() =>
      expect(screen.getAllByText('Jikan: Healthy').length).toBeGreaterThan(1),
    );
    expect(dependencies.runJikanDiagnostic).toHaveBeenCalledTimes(1);
    expect(runMalConnectivityDiagnostic).not.toHaveBeenCalled();
    expect(screen.getAllByText('200 • 210 ms')).toHaveLength(5);
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

    await fireEvent.press(screen.getByLabelText('Português (Brasil)'));
    await waitFor(() =>
      expect(screen.getByText('Configurações')).toBeVisible(),
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'purikuki:language-preference:v1',
      'pt-BR',
    );
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
