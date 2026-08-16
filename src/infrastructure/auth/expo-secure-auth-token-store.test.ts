import type { AuthTokenRecord } from '@/application/auth/auth-contracts';
import { AuthTokenStoreError } from '@/application/auth/auth-contracts';
import {
  authTokenStorageKey,
  ExpoSecureAuthTokenStore,
} from '@/infrastructure/auth/expo-secure-auth-token-store';
import type { SecureStorePort } from '@/infrastructure/auth/expo-secure-auth-token-store';

function credential(accessToken = 'secret-token'): AuthTokenRecord {
  return {
    version: 1,
    accessToken,
    refreshToken: null,
    expiresAt: '2027-08-16T12:00:00.000Z',
  };
}

function createSecureStore(): jest.Mocked<SecureStorePort> {
  const values = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => {
      values.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      values.delete(key);
    }),
  };
}

describe('ExpoSecureAuthTokenStore', () => {
  it('sets, gets and removes a versioned credential', async () => {
    const secureStore = createSecureStore();
    const store = new ExpoSecureAuthTokenStore(secureStore);

    await store.set('anilist', credential());
    await expect(store.get('anilist')).resolves.toEqual(credential());
    await store.remove('anilist');
    await expect(store.get('anilist')).resolves.toBeNull();

    expect(authTokenStorageKey('anilist')).toBe('puriki.auth.anilist.v1');
    expect(secureStore.setItemAsync).toHaveBeenCalledWith(
      'puriki.auth.anilist.v1',
      JSON.stringify(credential()),
    );
  });

  it('keeps provider credentials isolated', async () => {
    const store = new ExpoSecureAuthTokenStore(createSecureStore());
    await store.set('anilist', credential('anilist-token'));
    await store.set('mal', credential('mal-token'));

    await expect(store.get('anilist')).resolves.toMatchObject({
      accessToken: 'anilist-token',
    });
    await expect(store.get('mal')).resolves.toMatchObject({
      accessToken: 'mal-token',
    });
  });

  it.each([
    'not-json',
    '{}',
    '{"version":1,"accessToken":""}',
    '{"version":1,"accessToken":"token","refreshToken":null,"expiresAt":"123"}',
  ])('removes invalid persisted value %s', async (stored) => {
    const secureStore = createSecureStore();
    secureStore.getItemAsync.mockResolvedValueOnce(stored);
    const store = new ExpoSecureAuthTokenStore(secureStore);

    await expect(store.get('anilist')).rejects.toMatchObject({
      reason: 'corrupt',
      cleanupFailed: false,
    });
    expect(secureStore.deleteItemAsync).toHaveBeenCalledWith(
      'puriki.auth.anilist.v1',
    );
  });

  it('reports failed corruption cleanup without exposing the stored value', async () => {
    const secureStore = createSecureStore();
    secureStore.getItemAsync.mockResolvedValueOnce('invalid');
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('unavailable'));
    const store = new ExpoSecureAuthTokenStore(secureStore);

    await expect(store.get('anilist')).rejects.toEqual(
      new AuthTokenStoreError('corrupt', true),
    );
  });

  it('classifies native read, write, and remove failures', async () => {
    const secureStore = createSecureStore();
    const store = new ExpoSecureAuthTokenStore(secureStore);
    secureStore.getItemAsync.mockRejectedValueOnce(new Error('read'));
    await expect(store.get('anilist')).rejects.toMatchObject({
      reason: 'read',
    });
    secureStore.setItemAsync.mockRejectedValueOnce(new Error('write'));
    await expect(store.set('anilist', credential())).rejects.toMatchObject({
      reason: 'write',
    });
    secureStore.deleteItemAsync.mockRejectedValueOnce(new Error('remove'));
    await expect(store.remove('anilist')).rejects.toMatchObject({
      reason: 'remove',
    });
  });
});
