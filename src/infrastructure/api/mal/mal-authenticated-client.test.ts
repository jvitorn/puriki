import { MalAuthenticatedClient } from '@/infrastructure/api/mal/mal-authenticated-client';
import { DEFAULT_MAL_BASE_URL } from '@/infrastructure/api/mal/mal-config';
import {
  MalHttpError,
  MalNetworkError,
  MalNotFoundError,
  MalRateLimitError,
  MalServiceUnavailableError,
  MalTimeoutError,
  MalUnauthorizedError,
} from '@/infrastructure/api/mal/mal-errors';

interface TestResponseOptions {
  headers?: Record<string, string>;
  status?: number;
}

function testResponse(
  body: string,
  options: TestResponseOptions = {},
): Response {
  const status = options.status ?? 200;
  const headers = Object.entries(options.headers ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        headers.find(
          ([header]) => header.toLowerCase() === name.toLowerCase(),
        )?.[1] ?? null,
    },
    text: jest.fn(async () => body),
  } as unknown as Response;
}

function mockFetch(
  ...responses: Response[]
): jest.MockedFunction<typeof fetch> {
  return jest.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('No test response configured.');
    return response;
  }) as unknown as jest.MockedFunction<typeof fetch>;
}

function createClient(
  fetchImpl: jest.MockedFunction<typeof fetch>,
  accessTokenProvider: () => Promise<string> = async () => 'user-token',
) {
  return new MalAuthenticatedClient({
    fetchImpl,
    accessTokenProvider,
    sleep: async () => undefined,
    random: () => 0,
  });
}

describe('MalAuthenticatedClient', () => {
  it('injects a Bearer token on GET and returns the parsed body', async () => {
    const fetchImpl = mockFetch(testResponse('{"data":[]}'));
    const client = createClient(fetchImpl);
    const response = await client.get('/users/@me/animelist', {
      fields: 'list_status',
      limit: 100,
      offset: 0,
    });
    expect(response).toEqual({ data: { data: [] }, status: 200 });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(
      `${DEFAULT_MAL_BASE_URL}/users/@me/animelist?fields=list_status&limit=100&offset=0`,
    );
    expect(init).toMatchObject({
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer user-token',
      },
    });
  });

  it('sends a form-urlencoded body on PATCH', async () => {
    const fetchImpl = mockFetch(
      testResponse('{"status":"watching","num_episodes_watched":5}'),
    );
    const client = createClient(fetchImpl);
    await client.patch('/anime/21/my_list_status', {
      status: 'watching',
      num_watched_episodes: 5,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_MAL_BASE_URL}/anime/21/my_list_status`);
    expect(init).toMatchObject({
      method: 'PATCH',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer user-token',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    expect(new URLSearchParams(init!.body as string).get('status')).toBe(
      'watching',
    );
  });

  it('sends DELETE without a body', async () => {
    const fetchImpl = mockFetch(testResponse('', { status: 200 }));
    const client = createClient(fetchImpl);
    await client.delete('/anime/21/my_list_status');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init).toMatchObject({ method: 'DELETE' });
    expect(init!.body).toBeUndefined();
  });

  it('retries a retryable GET failure and succeeds on the second attempt', async () => {
    const fetchImpl = mockFetch(
      testResponse('{"error":"unavailable"}', { status: 503 }),
      testResponse('{"data":[]}'),
    );
    const client = createClient(fetchImpl);
    await expect(client.get('/users/@me/animelist')).resolves.toEqual({
      data: { data: [] },
      status: 200,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does not retry PATCH or DELETE by default', async () => {
    const fetchImpl = mockFetch(
      testResponse('{"error":"unavailable"}', { status: 503 }),
    );
    const client = createClient(fetchImpl);
    await expect(
      client.patch('/anime/21/my_list_status', { status: 'watching' }),
    ).rejects.toBeInstanceOf(MalServiceUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, MalUnauthorizedError],
    [403, MalUnauthorizedError],
    [404, MalNotFoundError],
    [429, MalRateLimitError],
    [503, MalServiceUnavailableError],
    [418, MalHttpError],
  ] as const)('maps HTTP status %i to %s', async (status, errorClass) => {
    const fetchImpl = mockFetch(testResponse('{}', { status }));
    const client = createClient(fetchImpl);
    await expect(
      client.delete('/anime/21/my_list_status'),
    ).rejects.toBeInstanceOf(errorClass);
  });

  it('maps a network failure', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as jest.MockedFunction<typeof fetch>;
    const client = createClient(fetchImpl);
    await expect(
      client.delete('/anime/21/my_list_status'),
    ).rejects.toBeInstanceOf(MalNetworkError);
  });

  it('maps an aborted request to a timeout', async () => {
    const fetchImpl = jest.fn(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    }) as unknown as jest.MockedFunction<typeof fetch>;
    const client = new MalAuthenticatedClient({
      fetchImpl,
      accessTokenProvider: async () => 'user-token',
      timeoutMs: 5,
    });
    await expect(
      client.delete('/anime/21/my_list_status'),
    ).rejects.toBeInstanceOf(MalTimeoutError);
  });

  it('propagates a rejected access token provider without wrapping it', async () => {
    const fetchImpl = mockFetch();
    const client = createClient(fetchImpl, async () => {
      throw new MalUnauthorizedError(401);
    });
    await expect(client.get('/users/@me/animelist')).rejects.toBeInstanceOf(
      MalUnauthorizedError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
