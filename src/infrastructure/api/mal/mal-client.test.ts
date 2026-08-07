import animeCollectionFixture from '@/infrastructure/api/mal/fixtures/anime-collection.json';
import animeDetailFixture from '@/infrastructure/api/mal/fixtures/anime-detail.json';
import {
  buildMalUrl,
  createMalClient,
  createNativeMalTransport,
} from '@/infrastructure/api/mal/mal-client';
import { DEFAULT_MAL_BASE_URL } from '@/infrastructure/api/mal/mal-config';
import {
  MalConfigurationError,
  MalHttpError,
  MalNetworkError,
  MalNotFoundError,
  MalRateLimitError,
  MalResponseFormatError,
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

function requestedUrl(fetchImpl: jest.MockedFunction<typeof fetch>): string {
  return String(fetchImpl.mock.calls[0]?.[0]);
}

describe('native MAL fetch client', () => {
  it('uses the official base URL, injected Client ID, and safe GET headers', async () => {
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify(animeCollectionFixture)),
    );
    await createMalClient({
      clientId: 'injected-test-id',
      fetchImpl,
    }).anime.getRanking({ ranking_type: 'bypopularity' });
    expect(requestedUrl(fetchImpl)).toBe(
      `${DEFAULT_MAL_BASE_URL}/anime/ranking?ranking_type=bypopularity`,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-MAL-CLIENT-ID': 'injected-test-id',
        },
        signal: expect.any(Object),
      }),
    );
    const headers = new Headers(fetchImpl.mock.calls[0]?.[1]?.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('constructs all public catalog endpoints against an injected base URL', async () => {
    const fetchImpl = mockFetch(
      ...Array.from({ length: 4 }, () => testResponse('{}')),
    );
    const client = createMalClient({
      baseUrl: ' https://example.test/v2/// ',
      clientId: 'test-id',
      fetchImpl,
    });
    await client.anime.search({ q: 'Frieren' });
    await client.anime.getDetails(52991, 'id,title');
    await client.anime.getRanking({ ranking_type: 'upcoming' });
    await client.anime.getSeason(2026, 'summer', {
      sort: 'anime_num_list_users',
    });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.test/v2/anime?q=Frieren',
      'https://example.test/v2/anime/52991?fields=id%2Ctitle',
      'https://example.test/v2/anime/ranking?ranking_type=upcoming',
      'https://example.test/v2/anime/season/2026/summer?sort=anime_num_list_users',
    ]);
  });

  it('encodes sorted query parameters and omits nullish values', () => {
    expect(
      buildMalUrl('https://example.test/v2/', '/anime', {
        offset: undefined,
        q: 'Cowboy & Bebop',
        limit: 25,
        fields: null,
      }),
    ).toBe('https://example.test/v2/anime?limit=25&q=Cowboy%20%26%20Bebop');
  });

  it('reads and parses a successful response body exactly once', async () => {
    const response = testResponse(JSON.stringify(animeDetailFixture));
    const fetchImpl = mockFetch(response);
    await expect(
      createMalClient({ clientId: 'test-id', fetchImpl }).anime.getDetails(
        52991,
        'id,title',
      ),
    ).resolves.toEqual(animeDetailFixture);
    expect(response.text).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, MalHttpError],
    [401, MalUnauthorizedError],
    [403, MalUnauthorizedError],
    [404, MalNotFoundError],
    [429, MalRateLimitError],
    [500, MalServiceUnavailableError],
    [502, MalServiceUnavailableError],
    [503, MalServiceUnavailableError],
    [504, MalServiceUnavailableError],
  ])('maps HTTP %i explicitly', async (status, ErrorType) => {
    const response = testResponse(JSON.stringify({ message: 'failure' }), {
      status,
    });
    const fetchImpl = mockFetch(response, response);
    await expect(
      createNativeMalTransport({
        clientId: 'test-id',
        fetchImpl,
        maximumAttempts: 1,
      }).get('test', '/anime'),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it.each(['', 'not-json'])(
    'rejects an invalid successful body',
    async (body) => {
      const fetchImpl = mockFetch(testResponse(body));
      await expect(
        createNativeMalTransport({ clientId: 'test-id', fetchImpl }).get(
          'test',
          '/anime',
        ),
      ).rejects.toBeInstanceOf(MalResponseFormatError);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it('does not start a request when the Client ID is missing', async () => {
    const fetchImpl = mockFetch(testResponse('{}'));
    await expect(
      createNativeMalTransport({ clientId: '  ', fetchImpl }).get(
        'test',
        '/anime',
      ),
    ).rejects.toBeInstanceOf(MalConfigurationError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a fetch TypeError and retries it once by default', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as jest.MockedFunction<typeof fetch>;
    const sleep = jest.fn(async () => undefined);
    await expect(
      createNativeMalTransport({ clientId: 'test-id', fetchImpl, sleep }).get(
        'test',
        '/anime',
      ),
    ).rejects.toBeInstanceOf(MalNetworkError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('aborts and maps a timed-out request without exceeding the injected policy', async () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as unknown as jest.MockedFunction<typeof fetch>;
    const request = createNativeMalTransport({
      clientId: 'test-id',
      fetchImpl,
      maximumAttempts: 1,
      timeoutMs: 25,
    }).get('test', '/anime');
    const assertion = expect(request).rejects.toBeInstanceOf(MalTimeoutError);
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
    jest.useRealTimers();
  });

  it('uses Retry-After seconds before the single retry', async () => {
    const fetchImpl = mockFetch(
      testResponse('{}', { status: 429, headers: { 'Retry-After': '2' } }),
      testResponse('{}'),
    );
    const sleep = jest.fn(async () => undefined);
    await createNativeMalTransport({
      clientId: 'test-id',
      fetchImpl,
      sleep,
    }).get('test', '/anime');
    expect(sleep).toHaveBeenCalledWith(2_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uses a Retry-After HTTP date for a service retry', async () => {
    const now = Date.parse('2026-08-06T12:00:00.000Z');
    const fetchImpl = mockFetch(
      testResponse('{}', {
        status: 503,
        headers: { 'Retry-After': 'Thu, 06 Aug 2026 12:00:05 GMT' },
      }),
      testResponse('{}'),
    );
    const sleep = jest.fn(async () => undefined);
    await createNativeMalTransport({
      clientId: 'test-id',
      fetchImpl,
      now: () => now,
      sleep,
    }).get('test', '/anime');
    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  it('bounds an excessive Retry-After delay so fallback remains responsive', async () => {
    const fetchImpl = mockFetch(
      testResponse('{}', { status: 429, headers: { 'Retry-After': '600' } }),
      testResponse('{}'),
    );
    const sleep = jest.fn(async () => undefined);
    await createNativeMalTransport({
      clientId: 'test-id',
      fetchImpl,
      sleep,
    }).get('test', '/anime');
    expect(sleep).toHaveBeenCalledWith(5_000);
  });

  it('uses deterministic bounded jitter and never exceeds two attempts', async () => {
    const response = testResponse('{}', { status: 504 });
    const fetchImpl = mockFetch(response, response, testResponse('{}'));
    const sleep = jest.fn(async () => undefined);
    await expect(
      createNativeMalTransport({
        clientId: 'test-id',
        fetchImpl,
        random: () => 0.5,
        sleep,
        maximumAttempts: 99,
      }).get('test', '/anime'),
    ).rejects.toBeInstanceOf(MalServiceUnavailableError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1_500);
  });

  it('does not log the injected Client ID or request headers', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const clientId = 'private-test-value-never-render';
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const fetchImpl = mockFetch(testResponse('{}', { status: 400 }));
    await expect(
      createNativeMalTransport({ clientId, fetchImpl }).get('test', '/anime'),
    ).rejects.toBeInstanceOf(MalHttpError);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(clientId);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('X-MAL-CLIENT-ID');
    warn.mockRestore();
    process.env.NODE_ENV = previousNodeEnv;
  });
});
