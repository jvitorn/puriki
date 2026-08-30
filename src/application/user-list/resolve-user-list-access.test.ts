import { resolveUserListAccess } from '@/application/user-list/resolve-user-list-access';
import { TestAuthSessionController } from '@/tests/auth/test-auth-session';

describe('resolveUserListAccess', () => {
  const readyPrimary = { phase: 'ready' as const, selected: null };

  it('selects queued guest writes, direct provider writes, and reconnect state', () => {
    const session = new TestAuthSessionController();
    expect(resolveUserListAccess(session.getSnapshot(), readyPrimary)).toEqual({
      scope: 'guest',
      canMutate: true,
      updateMode: 'queued',
    });

    session.updateConnection('anilist', {
      state: 'connected',
      account: {
        provider: 'anilist',
        userId: '42',
        username: 'reader',
        avatarUrl: null,
        expiresAt: '2099-01-01T00:00:00.000Z',
      },
      operation: 'idle',
      failure: null,
      canRetry: false,
    });
    expect(resolveUserListAccess(session.getSnapshot(), readyPrimary)).toEqual({
      scope: 'anilist:42',
      canMutate: true,
      updateMode: 'direct',
    });

    session.updateConnection('anilist', {
      state: 'reconnect_required',
      account: null,
      operation: 'idle',
      failure: 'invalid_token',
      canRetry: false,
    });
    expect(resolveUserListAccess(session.getSnapshot(), readyPrimary)).toEqual({
      scope: 'reconnect-required:anilist',
      canMutate: false,
      updateMode: 'unavailable',
    });
  });

  it('requires a primary choice for two connected accounts', () => {
    const session = new TestAuthSessionController();
    for (const [provider, userId] of [
      ['anilist', '42'],
      ['mal', '7'],
    ] as const) {
      session.updateConnection(provider, {
        state: 'connected',
        account: {
          provider,
          userId,
          username: 'reader',
          avatarUrl: null,
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
        operation: 'idle',
        failure: null,
        canRetry: false,
      });
    }

    expect(resolveUserListAccess(session.getSnapshot(), readyPrimary)).toEqual({
      scope: 'primary-required',
      canMutate: false,
      updateMode: 'unavailable',
    });
    expect(
      resolveUserListAccess(session.getSnapshot(), {
        phase: 'ready',
        selected: 'mal',
      }),
    ).toEqual({ scope: 'mal:7', canMutate: true, updateMode: 'direct' });
  });
});
