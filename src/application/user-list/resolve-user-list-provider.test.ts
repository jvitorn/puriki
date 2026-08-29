import type { AuthSessionSnapshot } from '@/application/auth/auth-contracts';
import type { PrimaryListProviderSnapshot } from '@/application/user-list/primary-list-provider-contracts';
import { resolveUserListProvider } from '@/application/user-list/resolve-user-list-provider';
import type { ConnectedAccount } from '@/domain/models/auth';

function account(provider: 'anilist' | 'mal', userId = '1'): ConnectedAccount {
  return {
    provider,
    userId,
    username: `user-${provider}`,
    avatarUrl: null,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

function connections(
  overrides: Partial<AuthSessionSnapshot['connections']>,
): AuthSessionSnapshot['connections'] {
  const disconnected = {
    state: 'disconnected' as const,
    account: null,
    operation: 'idle' as const,
    failure: null,
    canRetry: false,
  };
  return {
    anilist: disconnected,
    mal: disconnected,
    ...overrides,
  };
}

function connected(provider: 'anilist' | 'mal') {
  return {
    state: 'connected' as const,
    account: account(provider),
    operation: 'idle' as const,
    failure: null,
    canRetry: false,
  };
}

function reconnecting() {
  return {
    state: 'reconnect_required' as const,
    account: null,
    operation: 'idle' as const,
    failure: 'invalid_token' as const,
    canRetry: false,
  };
}

const loadingPrimary: PrimaryListProviderSnapshot = {
  phase: 'loading',
  selected: null,
};
const noPrimary: PrimaryListProviderSnapshot = {
  phase: 'ready',
  selected: null,
};

describe('resolveUserListProvider', () => {
  it('resolves guest when nothing is connected or reconnecting', () => {
    expect(resolveUserListProvider(connections({}), noPrimary)).toEqual({
      kind: 'guest',
    });
  });

  it('resolves reconnect_required when nothing is connected but one is pending', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: reconnecting() }),
        noPrimary,
      ),
    ).toEqual({ kind: 'reconnect_required', providers: ['anilist'] });
  });

  it('lists every pending provider when both need reconnection', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: reconnecting(), mal: reconnecting() }),
        noPrimary,
      ),
    ).toEqual({ kind: 'reconnect_required', providers: ['anilist', 'mal'] });
  });

  it('uses the sole connected provider, ignoring any primary preference', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: connected('anilist') }),
        noPrimary,
      ),
    ).toEqual({
      kind: 'active',
      provider: 'anilist',
      account: account('anilist'),
    });
    expect(
      resolveUserListProvider(
        connections({ mal: connected('mal') }),
        noPrimary,
      ),
    ).toEqual({ kind: 'active', provider: 'mal', account: account('mal') });
  });

  it('uses the sole connected provider even with a stale preference for the other', () => {
    expect(
      resolveUserListProvider(connections({ anilist: connected('anilist') }), {
        phase: 'ready',
        selected: 'mal',
      }),
    ).toEqual({
      kind: 'active',
      provider: 'anilist',
      account: account('anilist'),
    });
  });

  it('uses the sole connected provider even while the other is reconnect_required', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: connected('anilist'), mal: reconnecting() }),
        noPrimary,
      ),
    ).toEqual({
      kind: 'active',
      provider: 'anilist',
      account: account('anilist'),
    });
  });

  it('waits while the primary preference is still loading with both connected', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: connected('anilist'), mal: connected('mal') }),
        loadingPrimary,
      ),
    ).toEqual({ kind: 'loading' });
  });

  it('uses the stored primary provider when both are connected', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: connected('anilist'), mal: connected('mal') }),
        { phase: 'ready', selected: 'mal' },
      ),
    ).toEqual({ kind: 'active', provider: 'mal', account: account('mal') });
  });

  it('requires a primary choice when both connected and nothing is stored', () => {
    expect(
      resolveUserListProvider(
        connections({ anilist: connected('anilist'), mal: connected('mal') }),
        noPrimary,
      ),
    ).toEqual({
      kind: 'primary_required',
      candidates: ['anilist', 'mal'],
    });
  });
});
