import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';
import { DeveloperToolsPanel } from '@/presentation/components/settings/developer-tools-panel';
import { renderWithProviders } from '@/tests/render/test-render';
import { createTestDependencies } from '@/tests/repositories/test-dependencies';

jest.mock('@/infrastructure/api/mal/mal-diagnostics', () => ({
  runMalConnectivityDiagnostic: jest.fn(),
}));

describe('DeveloperToolsPanel', () => {
  it('shows only AniList and MAL diagnostics and shares one UI lock', async () => {
    let resolveAniList: (() => void) | undefined;
    const dependencies = createTestDependencies();
    dependencies.runAniListDiagnostic = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveAniList = () =>
            resolve({
              results: [],
              summary: {
                passed: 0,
                total: 0,
                averageLatencyMs: 0,
                slowestTest: null,
                totalResponseBytes: 0,
                requestsMade: 0,
                startingRemaining: null,
                endingRemaining: null,
                rateLimitResponses: 0,
                stoppedByRateLimit: false,
              },
            });
        }),
    );

    await renderWithProviders(
      <DeveloperToolsPanel appVersion="1.0.0" onDisable={jest.fn()} />,
      { dependencies },
    );

    expect(screen.getByLabelText('Test AniList API')).toBeVisible();
    expect(screen.getByLabelText('Test MyAnimeList API')).toBeVisible();
    expect(screen.getAllByRole('button')).toHaveLength(5);

    await fireEvent.press(screen.getByLabelText('Test AniList API'));
    await waitFor(() =>
      expect(dependencies.runAniListDiagnostic).toHaveBeenCalledTimes(1),
    );
    expect(screen.getByLabelText('Test MyAnimeList API')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('Test MyAnimeList API'));
    expect(runMalConnectivityDiagnostic).not.toHaveBeenCalled();

    resolveAniList?.();
    await waitFor(() =>
      expect(screen.getByLabelText('Test MyAnimeList API')).toBeEnabled(),
    );
  });
});
