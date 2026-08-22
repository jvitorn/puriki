import type {
  AuthTokenRecord,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import {
  AuthOperationError,
  AuthTokenStoreError,
} from '@/application/auth/auth-contracts';
import type { MalOAuthClientPort } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import { MalAuthProvider } from '@/infrastructure/auth/mal/mal-auth-provider';
import type { MalViewerClientPort } from '@/infrastructure/auth/mal/mal-viewer-client';

const validRecord: AuthTokenRecord = {
  version: 1,
  accessToken: 'stored-token',
  refreshToken: 'stored-refresh-token',
  expiresAt: '2026-08-16T13:00:00.000Z',
};

function createDependencies(record: AuthTokenRecord | null = null) {
  const tokenStore: jest.Mocked<AuthTokenStore> = {
    get: jest.fn(async (_provider) => record),
    set: jest.fn(async (_provider, _value) => undefined),
    remove: jest.fn(async (_provider) => undefined),
  };
  const oauthClient: jest.Mocked<MalOAuthClientPort> = {
    authorize: jest.fn(async () => ({
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
      expiresAt: '2026-08-16T13:00:00.000Z',
    })),
    refresh: jest.fn(async (_refreshToken) => ({
      accessToken: 'refreshed-token',
      refreshToken: 'refreshed-refresh-token',
      expiresAt: '2026-08-16T14:00:00.000Z',
    })),
  };
  const viewerClient: jest.Mocked<MalViewerClientPort> = {
    getViewer: jest.fn(async (_accessToken) => ({
      id: 42,
      name: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
    })),
  };
  const provider = new MalAuthProvider({
    tokenStore,
    oauthClient,
    viewerClient,
    now: () => Date.parse('2026-08-16T12:00:00.000Z'),
    platform: 'android',
  });
  return { oauthClient, provider, tokenStore, viewerClient };
}

describe('MalAuthProvider', () => {
  it('persists a real refresh token and returns a neutral account', async () => {
    const { provider, tokenStore, viewerClient } = createDependencies();
    await expect(provider.signIn()).resolves.toEqual({
      provider: 'mal',
      userId: '42',
      username: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
      expiresAt: '2026-08-16T13:00:00.000Z',
    });
    expect(tokenStore.set).toHaveBeenCalledWith('mal', {
      version: 1,
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
      expiresAt: '2026-08-16T13:00:00.000Z',
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
    expect(tokenStore.remove).toHaveBeenCalledWith('mal');
  });

  it('restores a connected session for a token that is not near expiry', async () => {
    const { provider, oauthClient } = createDependencies({
      ...validRecord,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    await expect(provider.restoreSession()).resolves.toMatchObject({
      state: 'connected',
      account: { username: 'aiko' },
    });
    expect(oauthClient.refresh).not.toHaveBeenCalled();
  });

  it('silently refreshes an expired access token during restore', async () => {
    const { provider, oauthClient, tokenStore, viewerClient } =
      createDependencies({
        ...validRecord,
        expiresAt: '2025-01-01T00:00:00.000Z',
      });
    await expect(provider.restoreSession()).resolves.toMatchObject({
      state: 'connected',
      account: { username: 'aiko' },
    });
    expect(oauthClient.refresh).toHaveBeenCalledWith('stored-refresh-token');
    expect(tokenStore.set).toHaveBeenCalledWith('mal', {
      version: 1,
      accessToken: 'refreshed-token',
      refreshToken: 'refreshed-refresh-token',
      expiresAt: '2026-08-16T14:00:00.000Z',
    });
    expect(viewerClient.getViewer).toHaveBeenCalledWith('refreshed-token');
  });

  it('requires reconnection when a refresh attempt fails during restore', async () => {
    const { provider, oauthClient, tokenStore } = createDependencies({
      ...validRecord,
      expiresAt: '2025-01-01T00:00:00.000Z',
    });
    oauthClient.refresh.mockRejectedValueOnce(new Error('invalid_grant'));
    await expect(provider.restoreSession()).resolves.toEqual({
      state: 'reconnect_required',
      failure: undefined,
    });
    expect(tokenStore.remove).toHaveBeenCalledWith('mal');
  });

  it('refreshes once and retries after a live 401 on a token that looked valid', async () => {
    const { provider, oauthClient, viewerClient } = createDependencies({
      ...validRecord,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    viewerClient.getViewer.mockRejectedValueOnce(
      new AuthOperationError('invalid_token', { reconnectRequired: true }),
    );
    await expect(provider.restoreSession()).resolves.toMatchObject({
      state: 'connected',
      account: { username: 'aiko' },
    });
    expect(oauthClient.refresh).toHaveBeenCalledTimes(1);
    expect(viewerClient.getViewer).toHaveBeenCalledTimes(2);
  });

  it('falls back to reconnect_required when the retry after refresh also fails', async () => {
    const { provider, tokenStore, viewerClient } = createDependencies({
      ...validRecord,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });
    viewerClient.getViewer.mockRejectedValue(
      new AuthOperationError('invalid_token', { reconnectRequired: true }),
    );
    await expect(provider.restoreSession()).resolves.toEqual({
      state: 'reconnect_required',
      failure: undefined,
    });
    expect(tokenStore.remove).toHaveBeenCalledWith('mal');
  });

  it('reports disconnected for a missing token', async () => {
    const { provider } = createDependencies(null);
    await expect(provider.restoreSession()).resolves.toEqual({
      state: 'disconnected',
    });
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

    const unsupported = new MalAuthProvider({
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
