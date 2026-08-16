import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  ExpoAniListOAuthClient,
  type ExpoAniListOAuthClientOptions,
} from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';

function successResult(
  params: Record<string, string> = {
    access_token: 'oauth-token',
    expires_in: '3600',
    state: 'test-state',
  },
) {
  return {
    type: 'success' as const,
    url: `puriki://auth/anilist#${new URLSearchParams(params)}`,
  };
}

function createClient(
  result: object = successResult(),
  overrides: ExpoAniListOAuthClientOptions = {},
) {
  type OpenAuthSession = NonNullable<
    ExpoAniListOAuthClientOptions['openAuthSessionImpl']
  >;
  const openAuthSession = jest.fn<
    ReturnType<OpenAuthSession>,
    Parameters<OpenAuthSession>
  >(async () => result as never);
  const completeAuthSession = jest.fn();
  const diagnosticLogger = jest.fn();
  const stateFactory = jest.fn(() => 'test-state');
  const client = new ExpoAniListOAuthClient({
    clientId: '1234',
    platform: 'android',
    now: () => Date.parse('2026-08-16T12:00:00.000Z'),
    makeRedirectUriImpl: () => 'puriki://auth/anilist',
    openAuthSessionImpl: openAuthSession,
    stateFactory,
    completeAuthSession,
    diagnosticLogger,
    isDevelopment: true,
    ...overrides,
  });
  return {
    client,
    completeAuthSession,
    diagnosticLogger,
    openAuthSession,
    stateFactory,
  };
}

describe('ExpoAniListOAuthClient', () => {
  it('opens the minimal implicit grant URL and parses the token fragment', async () => {
    const {
      client,
      completeAuthSession,
      diagnosticLogger,
      openAuthSession,
      stateFactory,
    } = createClient();

    await expect(client.authorize()).resolves.toEqual({
      accessToken: 'oauth-token',
      expiresAt: '2026-08-16T13:00:00.000Z',
    });
    expect(completeAuthSession).toHaveBeenCalledTimes(1);
    expect(stateFactory).toHaveBeenCalledTimes(1);
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://anilist.co/api/v2/oauth/authorize?client_id=1234&response_type=token&state=test-state',
      'puriki://auth/anilist',
    );
    expect(diagnosticLogger).toHaveBeenCalledWith({
      clientId: '1234',
      redirectUri: 'puriki://auth/anilist',
      responseType: 'token',
      authorizationUrl:
        'https://anilist.co/api/v2/oauth/authorize?client_id=1234&response_type=token&state=test-state',
    });
  });

  it('builds only the AniList-supported implicit parameters', async () => {
    const { client, openAuthSession } = createClient();

    await client.authorize();

    const authorizationUrl = new URL(openAuthSession.mock.calls[0]![0]);
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      'https://anilist.co/api/v2/oauth/authorize',
    );
    expect(Object.fromEntries(authorizationUrl.searchParams)).toEqual({
      client_id: '1234',
      response_type: 'token',
      state: 'test-state',
    });
    expect(authorizationUrl.searchParams.has('redirect_uri')).toBe(false);
    expect(authorizationUrl.searchParams.has('grant_type')).toBe(false);
    expect(authorizationUrl.searchParams.has('code_challenge')).toBe(false);
    expect(authorizationUrl.searchParams.has('code_challenge_method')).toBe(
      false,
    );
    expect(authorizationUrl.searchParams.has('client_secret')).toBe(false);
  });

  it('does not log OAuth diagnostics outside development', async () => {
    const diagnosticLogger = jest.fn();
    const { client } = createClient(successResult(), {
      diagnosticLogger,
      isDevelopment: false,
    });

    await client.authorize();

    expect(diagnosticLogger).not.toHaveBeenCalled();
  });

  it('continues sign-in if the development diagnostic logger fails', async () => {
    const { client } = createClient(successResult(), {
      diagnosticLogger: () => {
        throw new Error('diagnostic failure');
      },
    });

    await expect(client.authorize()).resolves.toMatchObject({
      accessToken: 'oauth-token',
    });
  });

  it('uses the documented one-year lifetime when expires_in is omitted', async () => {
    const { client } = createClient(
      successResult({ access_token: 'token', state: 'test-state' }),
    );
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
    const { client } = createClient(
      successResult({ error: 'access_denied', state: 'test-state' }),
    );
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'cancelled',
      cancelled: true,
    });
  });

  it('rejects missing client configuration before opening a browser', async () => {
    const { client, openAuthSession } = createClient(successResult(), {
      clientId: ' ',
    });
    await expect(client.authorize()).rejects.toEqual(
      new AuthOperationError('configuration'),
    );
    expect(openAuthSession).not.toHaveBeenCalled();
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
    const { client, openAuthSession } = createClient(
      successResult(),
      overrides,
    );
    await expect(client.authorize()).rejects.toMatchObject({ code });
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it('rejects a success response without an access token', async () => {
    const { client } = createClient(successResult({ state: 'test-state' }));
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects a return with a missing or mismatched state', async () => {
    const { client } = createClient(
      successResult({ access_token: 'token', state: 'wrong-state' }),
    );
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects a return from an unexpected deep link', async () => {
    const { client } = createClient({
      type: 'success',
      url: 'puriki://wrong#access_token=token&state=test-state',
    });
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('maps browser failures without leaking their message', async () => {
    const { client, openAuthSession } = createClient();
    openAuthSession.mockRejectedValueOnce(new Error('secret browser details'));
    await expect(client.authorize()).rejects.toEqual(
      new AuthOperationError('provider_unavailable', { canRetry: true }),
    );
  });
});
