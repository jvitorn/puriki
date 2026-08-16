import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

import type { OnboardingStorage } from '@/infrastructure/storage/onboarding-storage';
import { AuthSessionProvider } from '@/presentation/providers/auth-session-provider';
import {
  OnboardingGate,
  OnboardingNavigator,
  useOnboardingCompletion,
} from '@/presentation/providers/onboarding-provider';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';

function createStorage(completed: boolean): jest.Mocked<OnboardingStorage> {
  return {
    hasCompleted: jest.fn(async () => completed),
    markCompleted: jest.fn(async () => undefined),
  };
}

function CompletionProbe({ status }: { status: string }) {
  const { completeOnboarding } = useOnboardingCompletion();
  return (
    <View>
      <Text>{status}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => void completeOnboarding()}
      >
        <Text>Complete onboarding</Text>
      </TouchableOpacity>
    </View>
  );
}

function renderWithAuth(
  element: ReactElement,
  session = new TestAuthSessionController(),
) {
  return render(
    <AuthSessionProvider session={session}>{element}</AuthSessionProvider>,
  );
}

describe('OnboardingGate', () => {
  it('keeps content hidden until storage resolves and then hides the splash', async () => {
    let resolveCompletion: ((completed: boolean) => void) | undefined;
    const storage = createStorage(false);
    storage.hasCompleted.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCompletion = resolve;
        }),
    );
    const splash = { hideAsync: jest.fn(async () => undefined) };

    await renderWithAuth(
      <OnboardingGate storage={storage} splash={splash}>
        {(status) => <Text>{status}</Text>}
      </OnboardingGate>,
    );

    expect(screen.queryByText('notCompleted')).not.toBeOnTheScreen();
    expect(splash.hideAsync).not.toHaveBeenCalled();

    await act(async () => resolveCompletion?.(false));
    await waitFor(() => expect(screen.getByText('notCompleted')).toBeVisible());
    expect(splash.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('loads onboarding and auth together and keeps the splash until both are ready', async () => {
    const storage = createStorage(true);
    const session = new TestAuthSessionController({ phase: 'restoring' });
    const restore = jest.spyOn(session, 'restore');
    const splash = { hideAsync: jest.fn(async () => undefined) };

    await renderWithAuth(
      <OnboardingGate storage={storage} splash={splash}>
        {(status) => <Text>{status}</Text>}
      </OnboardingGate>,
      session,
    );

    await waitFor(() => {
      expect(storage.hasCompleted).toHaveBeenCalledTimes(1);
      expect(restore).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByText('completed')).not.toBeOnTheScreen();
    expect(splash.hideAsync).not.toHaveBeenCalled();

    await act(async () => {
      session.update({ ...session.getSnapshot(), phase: 'ready' });
    });
    await waitFor(() => expect(screen.getByText('completed')).toBeVisible());
    expect(splash.hideAsync).toHaveBeenCalledTimes(1);
  });

  it('treats a storage read failure as a first access', async () => {
    const storage = createStorage(false);
    storage.hasCompleted.mockRejectedValueOnce(new Error('unavailable'));

    await renderWithAuth(
      <OnboardingGate
        storage={storage}
        splash={{ hideAsync: jest.fn(async () => undefined) }}
      >
        {(status) => <Text>{status}</Text>}
      </OnboardingGate>,
    );

    await waitFor(() => expect(screen.getByText('notCompleted')).toBeVisible());
  });

  it('completes the current session even when persistence fails', async () => {
    const storage = createStorage(false);
    storage.markCompleted.mockRejectedValueOnce(new Error('unavailable'));

    await renderWithAuth(
      <OnboardingGate
        storage={storage}
        splash={{ hideAsync: jest.fn(async () => undefined) }}
      >
        {(status) => <CompletionProbe status={status} />}
      </OnboardingGate>,
    );
    await waitFor(() => expect(screen.getByText('notCompleted')).toBeVisible());

    await fireEvent.press(screen.getByText('Complete onboarding'));

    await waitFor(() => expect(screen.getByText('completed')).toBeVisible());
    expect(storage.markCompleted).toHaveBeenCalledTimes(1);
  });
});

describe('OnboardingNavigator', () => {
  it('exposes only onboarding before completion', async () => {
    await renderWithAuth(
      <OnboardingNavigator
        storage={createStorage(false)}
        splash={{ hideAsync: jest.fn(async () => undefined) }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stack-screen-onboarding/index')).toBeVisible(),
    );
    expect(screen.queryByTestId('stack-screen-(tabs)')).not.toBeOnTheScreen();
    expect(
      screen.queryByTestId('stack-screen-anime/[id]'),
    ).not.toBeOnTheScreen();
  });

  it('exposes app routes only after completion', async () => {
    await renderWithAuth(
      <OnboardingNavigator
        storage={createStorage(true)}
        splash={{ hideAsync: jest.fn(async () => undefined) }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId('stack-screen-(tabs)')).toBeVisible(),
    );
    expect(screen.getByTestId('stack-screen-anime/[id]')).toBeVisible();
    expect(
      screen.queryByTestId('stack-screen-onboarding/index'),
    ).not.toBeOnTheScreen();
  });
});
