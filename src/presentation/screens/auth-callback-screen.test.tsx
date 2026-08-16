import { act, render, waitFor } from '@testing-library/react-native';

import type { OnboardingStorage } from '@/infrastructure/storage/onboarding-storage';
import { LocalizationProvider } from '@/localization/localization-provider';
import { AuthSessionProvider } from '@/presentation/providers/auth-session-provider';
import { OnboardingGate } from '@/presentation/providers/onboarding-provider';
import { AuthCallbackScreen } from '@/presentation/screens/auth-callback-screen';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';

function storage(completed: boolean): jest.Mocked<OnboardingStorage> {
  return {
    hasCompleted: jest.fn(async () => completed),
    markCompleted: jest.fn(async () => undefined),
  };
}

function signingInSession(): TestAuthSessionController {
  const session = new TestAuthSessionController();
  session.updateConnection('anilist', {
    state: 'disconnected',
    account: null,
    operation: 'signing_in',
    failure: null,
    canRetry: false,
  });
  return session;
}

async function renderCallback(options: {
  completed: boolean;
  session?: TestAuthSessionController;
  canGoBack: boolean;
}) {
  const back = jest.fn();
  const replace = jest.fn();
  const expoRouter = jest.requireMock<{ useRouter: () => unknown }>(
    'expo-router',
  );
  const router = jest.spyOn(expoRouter, 'useRouter').mockReturnValue({
    push: jest.fn(),
    back,
    replace,
    canGoBack: () => options.canGoBack,
  });
  const session = options.session ?? new TestAuthSessionController();
  const rendered = await render(
    <LocalizationProvider initialPreference="en">
      <AuthSessionProvider session={session}>
        <OnboardingGate
          storage={storage(options.completed)}
          splash={{ hideAsync: jest.fn(async () => undefined) }}
        >
          {() => <AuthCallbackScreen provider="anilist" />}
        </OnboardingGate>
      </AuthSessionProvider>
    </LocalizationProvider>,
  );
  return { ...rendered, back, replace, router, session };
}

describe('AuthCallbackScreen', () => {
  it('waits for the adapter flow and returns to the existing origin', async () => {
    const session = signingInSession();
    const signIn = jest.spyOn(session, 'signIn');
    const rendered = await renderCallback({
      completed: true,
      session,
      canGoBack: true,
    });
    await waitFor(() => expect(rendered.back).not.toHaveBeenCalled());

    await act(async () => {
      session.updateConnection('anilist', {
        state: 'connected',
        account: {
          provider: 'anilist',
          userId: '42',
          username: 'viewer',
          avatarUrl: null,
          expiresAt: '2027-01-01T00:00:00.000Z',
        },
        operation: 'idle',
        failure: null,
        canRetry: false,
      });
    });

    await waitFor(() => expect(rendered.back).toHaveBeenCalledTimes(1));
    expect(rendered.replace).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    rendered.router.mockRestore();
  });

  it.each([
    [false, '/onboarding'],
    [true, '/settings'],
  ] as const)(
    'uses the safe fallback for onboardingCompleted=%s',
    async (completed, destination) => {
      const rendered = await renderCallback({
        completed,
        canGoBack: false,
      });
      await waitFor(() =>
        expect(rendered.replace).toHaveBeenCalledWith(destination),
      );
      expect(rendered.back).not.toHaveBeenCalled();
      rendered.router.mockRestore();
    },
  );
});
