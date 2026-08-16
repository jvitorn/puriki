import type { AuthProvider } from '@/application/auth/auth-contracts';
import { AuthOperationError } from '@/application/auth/auth-contracts';
import { AuthSessionCoordinator } from '@/application/auth/auth-session-coordinator';

const account = {
  provider: 'anilist' as const,
  userId: '42',
  username: 'aiko',
  avatarUrl: null,
  expiresAt: '2027-08-16T12:00:00.000Z',
};

function createProvider(): jest.Mocked<AuthProvider> {
  return {
    id: 'anilist',
    signIn: jest.fn(async () => account),
    restoreSession: jest.fn(async () => ({ state: 'disconnected' as const })),
    signOut: jest.fn(async () => undefined),
  };
}

describe('AuthSessionCoordinator', () => {
  it('restores registered providers and leaves unavailable providers neutral', async () => {
    const provider = createProvider();
    provider.restoreSession.mockResolvedValueOnce({
      state: 'connected',
      account,
    });
    const session = new AuthSessionCoordinator([provider]);
    const listener = jest.fn();
    session.subscribe(listener);

    await session.restore();

    expect(session.getSnapshot()).toMatchObject({
      phase: 'ready',
      connections: {
        anilist: { state: 'connected', account, operation: 'idle' },
        mal: { state: 'disconnected', account: null },
      },
    });
    expect(listener).toHaveBeenCalled();
    await session.restore();
    expect(provider.restoreSession).toHaveBeenCalledTimes(1);
  });

  it('updates snapshots for sign-in and sign-out', async () => {
    const provider = createProvider();
    const session = new AuthSessionCoordinator([provider]);
    await session.restore();
    await session.signIn('anilist');
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'connected',
      account,
      failure: null,
    });
    await session.signOut('anilist');
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'disconnected',
      account: null,
    });
  });

  it('keeps cancellation stable and exposes transient retry without raw errors', async () => {
    const provider = createProvider();
    const session = new AuthSessionCoordinator([provider]);
    await session.restore();
    provider.signIn.mockRejectedValueOnce(
      new AuthOperationError('cancelled', { cancelled: true }),
    );
    await session.signIn('anilist');
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'disconnected',
      failure: null,
      canRetry: false,
    });

    provider.signIn.mockRejectedValueOnce(
      new AuthOperationError('network', { canRetry: true }),
    );
    await session.signIn('anilist');
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'disconnected',
      failure: 'network',
      canRetry: true,
    });

    provider.restoreSession.mockResolvedValueOnce({
      state: 'connected',
      account,
    });
    await session.retry('anilist');
    expect(provider.signIn).toHaveBeenCalledTimes(2);
    expect(provider.restoreSession).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot().connections.anilist.state).toBe('connected');
  });

  it('transitions definitive invalidation through one central action', async () => {
    const provider = createProvider();
    const session = new AuthSessionCoordinator([provider]);
    await session.restore();
    await session.signIn('anilist');
    await session.markReconnectRequired('anilist');
    expect(provider.signOut).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'reconnect_required',
      account: null,
    });
  });

  it('prevents concurrent browser operations and preserves provider isolation', async () => {
    const provider = createProvider();
    let resolveSignIn: ((value: typeof account) => void) | undefined;
    provider.signIn.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    const session = new AuthSessionCoordinator([provider]);
    await session.restore();

    const first = session.signIn('anilist');
    const second = session.signIn('anilist');
    expect(provider.signIn).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().connections.mal.state).toBe('disconnected');
    resolveSignIn?.(account);
    await Promise.all([first, second]);
    expect(session.getSnapshot().connections.anilist.state).toBe('connected');
  });

  it('keeps a connected snapshot when secure logout fails', async () => {
    const provider = createProvider();
    const session = new AuthSessionCoordinator([provider]);
    await session.restore();
    await session.signIn('anilist');
    provider.signOut.mockRejectedValueOnce(new AuthOperationError('storage'));
    await session.signOut('anilist');
    expect(session.getSnapshot().connections.anilist).toMatchObject({
      state: 'connected',
      account,
      failure: 'storage',
    });
  });
});
