import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import { SettingsScreen } from '@/presentation/screens/settings-screen';
import { createTestDependencies } from '@/tests/mocks/test-dependencies';
import { renderWithProviders } from '@/tests/render/test-render';

jest.mock('@/infrastructure/api/jikan/jikan-diagnostics', () => ({
  runJikanConnectivityDiagnostic: jest.fn(),
}));

jest.mock('@/infrastructure/api/mal/mal-diagnostics', () => ({
  runMalConnectivityDiagnostic: jest.fn(),
}));

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
  ok: true,
  platform: 'android',
  status: 200,
  elapsedMs: 210,
  errorKind: 'none' as const,
  message: 'Jikan responded successfully through the native transport.',
};

describe('SettingsScreen', () => {
  const expandDeveloperTools = async () =>
    fireEvent.press(screen.getByLabelText('Developer tools'));

  beforeEach(() => {
    jest.mocked(runMalConnectivityDiagnostic).mockResolvedValue(malSuccess);
    jest.mocked(runJikanConnectivityDiagnostic).mockResolvedValue(jikanSuccess);
  });

  afterEach(() => jest.clearAllMocks());

  it('renders four clearly described data-source choices', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByLabelText('Automatic')).toBeVisible();
    expect(screen.getByLabelText('Jikan only')).toBeVisible();
    expect(screen.getByLabelText('MyAnimeList only')).toBeVisible();
    expect(screen.getByLabelText('Mock')).toBeVisible();
    expect(
      screen.getByText('Uses Jikan first and falls back to MyAnimeList.'),
    ).toBeVisible();
  });

  it('disables MAL-only while leaving Automatic available when unconfigured', async () => {
    const dependencies = createTestDependencies();
    dependencies.malConfigured = false;
    await renderWithProviders(<SettingsScreen />, { dependencies });
    expect(
      screen.getByLabelText('MyAnimeList only').props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(
      screen.getByLabelText('Automatic').props.accessibilityState,
    ).toMatchObject({ disabled: false });
    expect(
      screen.getByText(
        /Automatic mode remains available, but its MyAnimeList fallback is unavailable/,
      ),
    ).toBeVisible();
  });

  it('renders provider-neutral runtime status', async () => {
    const dependencies = createTestDependencies();
    dependencies.mode = 'automatic';
    dependencies.malConfigured = true;
    dependencies.catalogRuntimeStatus = {
      mode: 'automatic',
      lastSuccessfulSource: 'mal',
      jikanCircuitState: 'open',
      lastFallbackAt: '2026-08-06T12:00:00.000Z',
    };
    await renderWithProviders(<SettingsScreen />, { dependencies });
    expect(screen.queryByText('Mode: Automatic')).not.toBeOnTheScreen();
    await expandDeveloperTools();
    expect(screen.getByText('Mode: Automatic')).toBeVisible();
    expect(
      screen.getByText('Last successful source: MyAnimeList'),
    ).toBeVisible();
    expect(screen.getByText('Jikan circuit: open')).toBeVisible();
  });

  it('runs MAL directly and renders an accessible success result', async () => {
    const dependencies = createTestDependencies();
    dependencies.malConfigured = true;
    await renderWithProviders(<SettingsScreen />, { dependencies });
    await expandDeveloperTools();
    fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));
    await waitFor(() =>
      expect(screen.getByText('MyAnimeList API is operational.')).toBeVisible(),
    );
    expect(runMalConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(runJikanConnectivityDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByText('HTTP 200 • 420 ms')).toBeVisible();
    expect(screen.getByText('Sample result: Sousou no Frieren')).toBeVisible();
    expect(screen.getByRole('alert')).toBeVisible();
    expect(screen.queryByText(/private-secret-value/)).toBeNull();
  });

  it('prevents duplicate diagnostics while the MAL test is pending', async () => {
    let resolveDiagnostic: ((value: typeof malSuccess) => void) | undefined;
    jest.mocked(runMalConnectivityDiagnostic).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDiagnostic = resolve;
        }),
    );
    await renderWithProviders(<SettingsScreen />);
    await expandDeveloperTools();
    fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));
    await waitFor(() =>
      expect(screen.getByLabelText('Testing MyAnimeList API…')).toBeDisabled(),
    );
    fireEvent.press(screen.getByLabelText('Testing MyAnimeList API…'));
    fireEvent.press(screen.getByLabelText('Test Jikan API'));
    expect(runMalConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(runJikanConnectivityDiagnostic).not.toHaveBeenCalled();
    resolveDiagnostic?.(malSuccess);
    await waitFor(() =>
      expect(screen.getByText('MyAnimeList API is operational.')).toBeVisible(),
    );
  });

  it.each([
    ['not_configured', 'MyAnimeList Client ID is not configured.'],
    ['unauthorized', 'MyAnimeList rejected the application Client ID.'],
    ['timeout', 'MyAnimeList took too long to respond.'],
    ['network', 'Unable to reach the MyAnimeList API.'],
    ['service_unavailable', 'The MyAnimeList API is temporarily unavailable.'],
  ] as const)(
    'renders the %s MAL failure safely',
    async (errorKind, message) => {
      jest.mocked(runMalConnectivityDiagnostic).mockResolvedValueOnce({
        ...malSuccess,
        ok: false,
        status: null,
        errorKind,
        message,
        sampleAnimeTitle: null,
      });
      await renderWithProviders(<SettingsScreen />);
      await expandDeveloperTools();
      fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));
      await waitFor(() => expect(screen.getByText(message)).toBeVisible());
      expect(screen.getByRole('alert')).toBeVisible();
    },
  );

  it('keeps the Jikan direct diagnostic as an independent action', async () => {
    await renderWithProviders(<SettingsScreen />);
    await expandDeveloperTools();
    fireEvent.press(screen.getByLabelText('Test Jikan API'));
    await waitFor(() =>
      expect(
        screen.getByText(
          'Jikan responded successfully through the native transport.',
        ),
      ).toBeVisible(),
    );
    expect(runJikanConnectivityDiagnostic).toHaveBeenCalledTimes(1);
    expect(runMalConnectivityDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByText('HTTP 200 • 210 ms')).toBeVisible();
  });

  it('keeps developer diagnostics collapsed until requested', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.queryByText('Runtime catalog status')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Test Jikan API')).not.toBeOnTheScreen();
    expect(
      screen.getByLabelText('Developer tools').props.accessibilityState,
    ).toMatchObject({ expanded: false });

    await expandDeveloperTools();
    expect(screen.getByText('Runtime catalog status')).toBeVisible();
    expect(screen.getByLabelText('Test Jikan API')).toBeVisible();
  });

  it('changes the selected data source through the radio control', async () => {
    const dependencies = createTestDependencies();
    dependencies.mode = 'automatic';
    dependencies.malConfigured = true;
    await renderWithProviders(<SettingsScreen />, { dependencies });

    fireEvent.press(screen.getByLabelText('Mock'));
    await waitFor(() =>
      expect(
        screen.getByLabelText('Mock').props.accessibilityState,
      ).toMatchObject({
        checked: true,
      }),
    );
  });
});
