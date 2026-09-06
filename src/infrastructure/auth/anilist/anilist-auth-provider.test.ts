import type {
  AuthTokenRecord,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import {
  AuthOperationError,
  AuthTokenStoreError,
} from '@/application/auth/auth-contracts';
import { AniListAuthProvider } from '@/infrastructure/auth/anilist/anilist-auth-provider';
import type { AniListViewerClientPort } from '@/infrastructure/auth/anilist/anilist-viewer-client';
import type { AniListOAuthClientPort } from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';

const validRecord: AuthTokenRecord = {
  version: 1,
  accessToken: 'stored-token',
  refreshToken: null,
  expiresAt: '2027-08-16T12:00:00.000Z',
};

function createDependencies(record: AuthTokenRecord | null = null) {
  const tokenStore: jest.Mocked<AuthTokenStore> = {
    get: jest.fn(async (_provider) => record),
    set: jest.fn(async (_provider, _value) => undefined),
    remove: jest.fn(async (_provider) => undefined),
  };
  const oauthClient: jest.Mocked<AniListOAuthClientPort> = {
    authorize: jest.fn(async () => ({
      accessToken: 'new-token',
      expiresAt: '2027-08-16T12:00:00.000Z',
    })),
  };
  const viewerClient: jest.Mocked<AniListViewerClientPort> = {
    getViewer: jest.fn(async (_accessToken) => ({
      id: 42,
      name: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
    })),
  };
  const provider = new AniListAuthProvider({
    tokenStore,
    oauthClient,
    viewerClient,
    now: () => Date.parse('2026-08-16T12:00:00.000Z'),
    platform: 'android',
  });
  return { oauthClient, provider, tokenStore, viewerClient };
}

describe('AniListAuthProvider', () => {
  it('persists OAuth credentials, validates Viewer, and returns a neutral account', async () => {
    const { provider, tokenStore, viewerClient } = createDependencies();
    await expect(provider.signIn()).resolves.toEqual({
      provider: 'anilist',
      userId: '42',
      username: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
      expiresAt: '2027-08-16T12:00:00.000Z',
    });
    expect(tokenStore.set).toHaveBeenCalledWith('anilist', {
      version: 1,
      accessToken: 'new-token',
      refreshToken: null,
      expiresAt: '2027-08-16T12:00:00.000Z',
    });
    expect(tokenStore.set.mock.invocationCallOrder[0]).toBeLessThan(
      viewerClient.getViewer.mock.invocationCallOrder[0] ?? Infinity,
    );
  });

  it('does not persist when OAuth is cancelled', async () => {
    const { oauthClient, provider, tokenStore } = createDependencies();
    oauthClient.authorize.mockRejectedValueOnce(
      new AuthOperationError('cancelled', { cancelled: true }),
    );
    await expect(provider.signIn()).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(tokenStore.set).not.toHaveBeenCalled();
  });

  it('removes a definitively rejected token after Viewer validation', async () => {
    const { provider, tokenStore, viewerClient } = createDependencies();
    viewerClient.getViewer.mockRejectedValueOnce(
      new AuthOperationError('invalid_token', { reconnectRequired: true }),
    );
    await expect(provider.signIn()).rejects.toMatchObject({
      code: 'invalid_token',
      reconnectRequired: true,
    });
    expect(tokenStore.remove).toHaveBeenCalledWith('anilist');
  });

  it('keeps a token after a transient Viewer failure for retry', async () => {
    const { provider, tokenStore, viewerClient } = createDependencies();
    viewerClient.getViewer.mockRejectedValueOnce(
      new AuthOperationError('network', { canRetry: true }),
    );
    await expect(provider.signIn()).rejects.toMatchObject({
      code: 'network',
      canRetry: true,
    });
    expect(tokenStore.remove).not.toHaveBeenCalled();
  });

  it('restores disconnected, connected, expired, and revoked states', async () => {
    const missing = createDependencies(null);
    await expect(missing.provider.restoreSession()).resolves.toEqual({
      state: 'disconnected',
    });

    const connected = createDependencies(validRecord);
    await expect(connected.provider.restoreSession()).resolves.toMatchObject({
      state: 'connected',
      account: { username: 'aiko' },
    });

    const expired = createDependencies({
      ...validRecord,
      expiresAt: '2025-08-16T12:00:00.000Z',
    });
    await expect(expired.provider.restoreSession()).resolves.toEqual({
      state: 'reconnect_required',
      failure: undefined,
    });
    expect(expired.tokenStore.remove).toHaveBeenCalledWith('anilist');

    const revoked = createDependencies(validRecord);
    revoked.viewerClient.getViewer.mockRejectedValueOnce(
      new AuthOperationError('invalid_token', { reconnectRequired: true }),
    );
    await expect(revoked.provider.restoreSession()).resolves.toEqual({
      state: 'reconnect_required',
      failure: undefined,
    });
    expect(revoked.tokenStore.remove).toHaveBeenCalledWith('anilist');
  });

  it('keeps a stored token after a transient restore failure for retry', async () => {
    const { provider, tokenStore, viewerClient } =
      createDependencies(validRecord);
    viewerClient.getViewer.mockRejectedValueOnce(
      new AuthOperationError('network', { canRetry: true }),
    );
    await expect(provider.restoreSession()).rejects.toMatchObject({
      code: 'network',
      canRetry: true,
    });
    expect(tokenStore.remove).not.toHaveBeenCalled();
  });

  it('maps corrupt and unavailable storage safely', async () => {
    const corrupt = createDependencies();
    corrupt.tokenStore.get.mockRejectedValueOnce(
      new AuthTokenStoreError('corrupt'),
    );
    await expect(corrupt.provider.restoreSession()).resolves.toEqual({
      state: 'reconnect_required',
      failure: undefined,
    });

    const unavailable = createDependencies();
    unavailable.tokenStore.get.mockRejectedValueOnce(
      new AuthTokenStoreError('read'),
    );
    await expect(unavailable.provider.restoreSession()).rejects.toMatchObject({
      code: 'storage',
      canRetry: true,
    });
  });

  it('reports logout storage failure and keeps unsupported platforms inert', async () => {
    const { provider, tokenStore } = createDependencies(validRecord);
    tokenStore.remove.mockRejectedValueOnce(new AuthTokenStoreError('remove'));
    await expect(provider.signOut()).rejects.toMatchObject({ code: 'storage' });

    const unsupported = new AniListAuthProvider({
      tokenStore,
      oauthClient: createDependencies().oauthClient,
      viewerClient: createDependencies().viewerClient,
      platform: 'web',
    });
    await expect(unsupported.restoreSession()).resolves.toEqual({
      state: 'disconnected',
    });
    await expect(unsupported.signOut()).resolves.toBeUndefined();
  });
});
