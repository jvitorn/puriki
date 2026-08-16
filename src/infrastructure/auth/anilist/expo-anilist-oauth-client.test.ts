import { ResponseType } from 'expo-auth-session';

import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  ExpoAniListOAuthClient,
  type ExpoAniListOAuthClientOptions,
} from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';

function successResult(
  params: Record<string, string> = {
    access_token: 'oauth-token',
    expires_in: '3600',
  },
) {
  return {
    type: 'success' as const,
    errorCode: null,
    params,
    authentication: null,
    url: 'puriki://auth/anilist',
  };
}

function createClient(
  result: object = successResult(),
  overrides: ExpoAniListOAuthClientOptions = {},
) {
  const promptAsync = jest.fn(async () => result as never);
  const authRequestFactory = jest.fn(() => ({ promptAsync }));
  const completeAuthSession = jest.fn();
  const client = new ExpoAniListOAuthClient({
    clientId: '1234',
    platform: 'android',
    now: () => Date.parse('2026-08-16T12:00:00.000Z'),
    makeRedirectUriImpl: () => 'puriki://auth/anilist',
    authRequestFactory,
    completeAuthSession,
    ...overrides,
  });
  return { authRequestFactory, client, completeAuthSession, promptAsync };
}

describe('ExpoAniListOAuthClient', () => {
  it('uses implicit grant and returns a calculated expiration', async () => {
    const { authRequestFactory, client, completeAuthSession, promptAsync } =
      createClient();

    await expect(client.authorize()).resolves.toEqual({
      accessToken: 'oauth-token',
      expiresAt: '2026-08-16T13:00:00.000Z',
    });
    expect(completeAuthSession).toHaveBeenCalledTimes(1);
    expect(authRequestFactory).toHaveBeenCalledWith({
      clientId: '1234',
      redirectUri: 'puriki://auth/anilist',
      responseType: ResponseType.Token,
      usePKCE: false,
    });
    expect(promptAsync).toHaveBeenCalledWith({
      authorizationEndpoint: 'https://anilist.co/api/v2/oauth/authorize',
    });
  });

  it('uses the documented one-year lifetime when expires_in is omitted', async () => {
    const { client } = createClient(successResult({ access_token: 'token' }));
    await expect(client.authorize()).resolves.toEqual({
      accessToken: 'token',
      expiresAt: '2027-08-16T12:00:00.000Z',
    });
  });

  it.each([{ type: 'cancel' }, { type: 'dismiss' }] as const)(
    'maps $type to a stable cancellation',
    async (result) => {
      const { client } = createClient(result);
      await expect(client.authorize()).rejects.toMatchObject({
        code: 'cancelled',
        cancelled: true,
      });
    },
  );

  it('treats denied consent as a cancellation', async () => {
    const { client } = createClient({
      ...successResult({ error: 'access_denied' }),
      type: 'error',
    });
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'cancelled',
      cancelled: true,
    });
  });

  it('rejects missing client configuration before opening a browser', async () => {
    const { client, promptAsync } = createClient(successResult(), {
      clientId: ' ',
    });
    await expect(client.authorize()).rejects.toEqual(
      new AuthOperationError('configuration'),
    );
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it.each([
    [{ platform: 'web' }, 'unsupported_environment'],
    [
      {
        makeRedirectUriImpl: (): string => 'exp://127.0.0.1/--/auth/anilist',
      },
      'unsupported_environment',
    ],
    [{ makeRedirectUriImpl: (): string => 'puriki://wrong' }, 'redirect'],
  ] as const)('rejects unsupported native setup', async (overrides, code) => {
    const { client, promptAsync } = createClient(successResult(), overrides);
    await expect(client.authorize()).rejects.toMatchObject({ code });
    expect(promptAsync).not.toHaveBeenCalled();
  });

  it('rejects a success response without an access token', async () => {
    const { client } = createClient(successResult({}));
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('maps browser failures without leaking their message', async () => {
    const { client, promptAsync } = createClient();
    promptAsync.mockRejectedValueOnce(new Error('secret browser details'));
    await expect(client.authorize()).rejects.toEqual(
      new AuthOperationError('provider_unavailable', { canRetry: true }),
    );
  });
});
