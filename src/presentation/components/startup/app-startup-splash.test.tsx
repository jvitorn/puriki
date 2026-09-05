import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Text } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import {
  AppStartupSplash,
  STARTUP_TRANSITION_DURATION_MS,
} from '@/presentation/components/startup/app-startup-splash';

const reducedMotion = jest.mocked(useReducedMotion);

describe('AppStartupSplash', () => {
  beforeEach(() => {
    reducedMotion.mockReset();
    reducedMotion.mockReturnValue(true);
  });

  it('hands off from the native splash and reveals ready app content', async () => {
    reducedMotion.mockReturnValue(false);
    const splash = { hideAsync: jest.fn(async () => undefined) };
    const scheduleExit = jest.fn((callback: () => void) => {
      callback();
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });

    await render(
      <AppStartupSplash scheduleExit={scheduleExit} splash={splash}>
        <Text>Ready app</Text>
      </AppStartupSplash>,
    );

    expect(screen.getByText('Ready app')).toBeVisible();
    expect(
      screen.getByTestId('app-startup-splash', {
        includeHiddenElements: true,
      }),
    ).toBeOnTheScreen();
    fireEvent(
      screen.getByTestId('app-startup-splash', {
        includeHiddenElements: true,
      }),
      'layout',
    );
    expect(splash.hideAsync).toHaveBeenCalledTimes(1);
    expect(STARTUP_TRANSITION_DURATION_MS).toBe(600);
    expect(scheduleExit).toHaveBeenCalledWith(expect.any(Function), 360);
    await waitFor(() =>
      expect(
        screen.queryByTestId('app-startup-splash', {
          includeHiddenElements: true,
        }),
      ).not.toBeOnTheScreen(),
    );
    expect(screen.getByText('Ready app')).toBeVisible();
  });

  it('skips motion without trapping the app when Reduce Motion is enabled', async () => {
    const splash = { hideAsync: jest.fn(async () => undefined) };
    await render(
      <AppStartupSplash splash={splash}>
        <Text>Reduced motion app</Text>
      </AppStartupSplash>,
    );

    fireEvent(
      screen.getByTestId('app-startup-splash', {
        includeHiddenElements: true,
      }),
      'layout',
    );
    await waitFor(() =>
      expect(
        screen.queryByTestId('app-startup-splash', {
          includeHiddenElements: true,
        }),
      ).not.toBeOnTheScreen(),
    );
    expect(splash.hideAsync).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Reduced motion app')).toBeVisible();
  });

  it('continues when hiding the native splash rejects', async () => {
    const splash = {
      hideAsync: jest.fn(async () => Promise.reject(new Error('native error'))),
    };
    await render(
      <AppStartupSplash splash={splash}>
        <Text>Fallback app</Text>
      </AppStartupSplash>,
    );

    fireEvent(
      screen.getByTestId('app-startup-splash', {
        includeHiddenElements: true,
      }),
      'layout',
    );
    await waitFor(() => expect(screen.getByText('Fallback app')).toBeVisible());
    expect(
      screen.queryByTestId('app-startup-splash', {
        includeHiddenElements: true,
      }),
    ).not.toBeOnTheScreen();
  });
});
