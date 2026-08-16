import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import {
  AuthSessionBootGate,
  AuthSessionProvider,
  useAuthSession,
} from '@/presentation/providers/auth-session-provider';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';

function SessionActionsProbe() {
  const { signIn, retry, signOut } = useAuthSession();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signIn('anilist')}
      >
        <Text>Sign in</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry('anilist')}
      >
        <Text>Retry</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void signOut('anilist')}
      >
        <Text>Sign out</Text>
      </Pressable>
    </>
  );
}

describe('AuthSessionProvider', () => {
  it('keeps app content hidden until session restoration is ready', async () => {
    const session = new TestAuthSessionController({ phase: 'restoring' });
    const restore = jest.spyOn(session, 'restore');
    await render(
      <AuthSessionProvider session={session}>
        <AuthSessionBootGate>
          <Text>Application ready</Text>
        </AuthSessionBootGate>
      </AuthSessionProvider>,
    );

    expect(screen.queryByText('Application ready')).not.toBeOnTheScreen();
    await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));

    await act(async () => {
      session.update({ ...session.getSnapshot(), phase: 'ready' });
    });
    expect(screen.getByText('Application ready')).toBeVisible();
  });

  it('exposes provider-neutral session actions', async () => {
    const session = new TestAuthSessionController();
    const signIn = jest.spyOn(session, 'signIn');
    const retry = jest.spyOn(session, 'retry');
    const signOut = jest.spyOn(session, 'signOut');
    await render(
      <AuthSessionProvider session={session}>
        <SessionActionsProbe />
      </AuthSessionProvider>,
    );

    await fireEvent.press(screen.getByText('Sign in'));
    await fireEvent.press(screen.getByText('Retry'));
    await fireEvent.press(screen.getByText('Sign out'));
    expect(signIn).toHaveBeenCalledWith('anilist');
    expect(retry).toHaveBeenCalledWith('anilist');
    expect(signOut).toHaveBeenCalledWith('anilist');
  });
});
