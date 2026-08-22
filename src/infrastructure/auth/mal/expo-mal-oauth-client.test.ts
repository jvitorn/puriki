import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  ExpoMalOAuthClient,
  type ExpoMalOAuthClientOptions,
} from '@/infrastructure/auth/mal/expo-mal-oauth-client';

function successResult(
  params: Record<string, string> = { code: 'auth-code', state: 'test-state' },
) {
  return {
    type: 'success' as const,
    url: `puriki://auth/mal?${new URLSearchParams(params)}`,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

function createClient(
  authResult: object = successResult(),
  overrides: ExpoMalOAuthClientOptions = {},
) {
  type OpenAuthSession = NonNullable<
    ExpoMalOAuthClientOptions['openAuthSessionImpl']
  >;
  const openAuthSession = jest.fn<
    ReturnType<OpenAuthSession>,
    Parameters<OpenAuthSession>
  >(async () => authResult as never);
  const completeAuthSession = jest.fn();
  const diagnosticLogger = jest.fn();
  const stateFactory = jest.fn(() => 'test-state');
  const codeVerifierFactory = jest.fn(() => 'test-code-verifier');
  const fetchImpl = jest.fn(async () =>
    jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    }),
  ) as unknown as jest.MockedFunction<typeof fetch>;
  const client = new ExpoMalOAuthClient({
    clientId: '1234',
    platform: 'android',
    now: () => Date.parse('2026-08-16T12:00:00.000Z'),
    makeRedirectUriImpl: () => 'puriki://auth/mal',
    openAuthSessionImpl: openAuthSession,
    stateFactory,
    codeVerifierFactory,
    completeAuthSession,
    diagnosticLogger,
    isDevelopment: true,
    fetchImpl,
    ...overrides,
  });
  return {
    client,
    codeVerifierFactory,
    completeAuthSession,
    diagnosticLogger,
    fetchImpl,
    openAuthSession,
    stateFactory,
  };
}

describe('ExpoMalOAuthClient', () => {
  it('opens the PKCE authorization URL and exchanges the returned code', async () => {
    const { client, completeAuthSession, openAuthSession, stateFactory, fetchImpl } =
      createClient();

    await expect(client.authorize()).resolves.toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: '2026-08-16T13:00:00.000Z',
    });
    expect(completeAuthSession).toHaveBeenCalledTimes(1);
    expect(stateFactory).toHaveBeenCalledTimes(1);
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://myanimelist.net/v1/oauth2/authorize?client_id=1234&response_type=code&redirect_uri=puriki%3A%2F%2Fauth%2Fmal&code_challenge=test-code-verifier&code_challenge_method=plain&state=test-state',
      'puriki://auth/mal',
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://myanimelist.net/v1/oauth2/token');
    expect(init).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const body = new URLSearchParams(init!.body as string);
    expect(Object.fromEntries(body)).toEqual({
      client_id: '1234',
      grant_type: 'authorization_code',
      code: 'auth-code',
      code_verifier: 'test-code-verifier',
      redirect_uri: 'puriki://auth/mal',
    });
  });

  it('only supports the plain PKCE challenge method (code_challenge === code_verifier)', async () => {
    const { client, openAuthSession } = createClient();
    await client.authorize();
    const authorizationUrl = new URL(openAuthSession.mock.calls[0]![0]);
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe(
      'plain',
    );
    expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
      'test-code-verifier',
    );
    expect(authorizationUrl.searchParams.has('client_secret')).toBe(false);
  });

  it('includes client_secret only when configured', async () => {
    const { client, fetchImpl } = createClient(successResult(), {
      clientSecret: 'shh',
    });
    await client.authorize();
    const body = new URLSearchParams(
      fetchImpl.mock.calls[0]![1]!.body as string,
    );
    expect(body.get('client_secret')).toBe('shh');
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
      { makeRedirectUriImpl: (): string => 'exp://127.0.0.1/--/auth/mal' },
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

  it('rejects a success response without an authorization code', async () => {
    const { client } = createClient(successResult({ state: 'test-state' }));
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects a return with a missing or mismatched state', async () => {
    const { client } = createClient(
      successResult({ code: 'auth-code', state: 'wrong-state' }),
    );
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  it('rejects a return from an unexpected deep link', async () => {
    const { client } = createClient({
      type: 'success',
      url: 'puriki://wrong?code=auth-code&state=test-state',
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

  it.each([
    [401, 'invalid_response'],
    [400, 'invalid_response'],
    [429, 'provider_unavailable'],
    [500, 'provider_unavailable'],
  ] as const)('maps token endpoint status %i to %s', async (status, code) => {
    const { client } = createClient(successResult(), {
      fetchImpl: jest.fn(async () =>
        jsonResponse({ error: 'invalid_grant' }, status),
      ) as unknown as typeof fetch,
    });
    await expect(client.authorize()).rejects.toMatchObject({ code });
  });

  it('maps a token endpoint network failure', async () => {
    const { client } = createClient(successResult(), {
      fetchImpl: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
    });
    await expect(client.authorize()).rejects.toEqual(
      new AuthOperationError('network', { canRetry: true }),
    );
  });

  it('rejects a token response missing access or refresh tokens', async () => {
    const { client } = createClient(successResult(), {
      fetchImpl: jest.fn(async () =>
        jsonResponse({ access_token: 'only-access' }),
      ) as unknown as typeof fetch,
    });
    await expect(client.authorize()).rejects.toMatchObject({
      code: 'invalid_response',
    });
  });

  describe('refresh', () => {
    it('exchanges a refresh token for a new credential', async () => {
      const { client, fetchImpl } = createClient();
      await expect(client.refresh('old-refresh-token')).resolves.toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: '2026-08-16T13:00:00.000Z',
      });
      const body = new URLSearchParams(
        fetchImpl.mock.calls[0]![1]!.body as string,
      );
      expect(Object.fromEntries(body)).toEqual({
        client_id: '1234',
        grant_type: 'refresh_token',
        refresh_token: 'old-refresh-token',
      });
    });

    it('rejects when the client is not configured', async () => {
      const { client } = createClient(successResult(), { clientId: ' ' });
      await expect(client.refresh('token')).rejects.toEqual(
        new AuthOperationError('configuration'),
      );
    });

    it('propagates a rejected refresh token as an invalid response', async () => {
      const { client } = createClient(successResult(), {
        fetchImpl: jest.fn(async () =>
          jsonResponse({ error: 'invalid_grant' }, 401),
        ) as unknown as typeof fetch,
      });
      await expect(client.refresh('expired')).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });
  });
});
