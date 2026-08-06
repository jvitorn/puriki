import animeFullFixture from '@/infrastructure/api/jikan/fixtures/anime-full.json';
import {
  buildJikanUrl,
  createJikanClient,
  executeJikanRequest,
} from '@/infrastructure/api/jikan/jikan-client';
import { DEFAULT_JIKAN_BASE_URL } from '@/infrastructure/api/jikan/jikan-config';
import { isJikanSingleAnimeResponse } from '@/infrastructure/api/jikan/jikan-dtos';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';

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
  const implementation = jest.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('No test response configured.');
    return response;
  });
  return implementation as unknown as jest.MockedFunction<typeof fetch>;
}

function requestedUrl(fetchImpl: jest.MockedFunction<typeof fetch>): string {
  return String(fetchImpl.mock.calls[0]?.[0]);
}

describe('native Jikan fetch client', () => {
  it('uses the default Jikan base URL and native GET headers', async () => {
    const fetchImpl = mockFetch(testResponse(JSON.stringify(animeFullFixture)));
    await createJikanClient({ fetchImpl }).anime.getAnimeFullById(1);
    expect(requestedUrl(fetchImpl)).toBe(
      `${DEFAULT_JIKAN_BASE_URL}/anime/1/full`,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_JIKAN_BASE_URL}/anime/1/full`,
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: expect.any(Object),
      }),
    );
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it('normalizes an injected base URL with trailing slashes', async () => {
    const fetchImpl = mockFetch(testResponse('{}'));
    await createJikanClient({
      baseUrl: ' https://example.test/jikan/// ',
      fetchImpl,
    }).top.getTopAnime();
    expect(requestedUrl(fetchImpl)).toBe(
      'https://example.test/jikan/top/anime',
    );
  });

  it('constructs every supported endpoint URL', async () => {
    const fetchImpl = mockFetch(
      ...Array.from({ length: 5 }, () => testResponse('{}')),
    );
    const client = createJikanClient({
      baseUrl: 'https://example.test/v4',
      fetchImpl,
    });
    await client.top.getTopAnime();
    await client.seasons.getSeasonNow();
    await client.seasons.getSeasonUpcoming();
    await client.anime.getAnimeSearch();
    await client.anime.getAnimeFullById(42);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.test/v4/top/anime',
      'https://example.test/v4/seasons/now',
      'https://example.test/v4/seasons/upcoming',
      'https://example.test/v4/anime',
      'https://example.test/v4/anime/42/full',
    ]);
  });

  it('encodes query parameters stably and omits nullish values', async () => {
    const fetchImpl = mockFetch(testResponse('{}'));
    await createJikanClient({ fetchImpl }).anime.getAnimeSearch({
      limit: 25,
      order_by: undefined,
      q: 'Cowboy & Bebop',
      sfw: true,
      sort: 'asc',
    });
    expect(requestedUrl(fetchImpl)).toBe(
      `${DEFAULT_JIKAN_BASE_URL}/anime?limit=25&q=Cowboy%20%26%20Bebop&sfw=true&sort=asc`,
    );
    expect(
      buildJikanUrl(DEFAULT_JIKAN_BASE_URL, '/anime', {
        limit: null,
        q: 'Bebop',
        sfw: true,
      }),
    ).toBe(`${DEFAULT_JIKAN_BASE_URL}/anime?q=Bebop&sfw=true`);
  });

  it('parses successful JSON after reading the body once', async () => {
    const response = testResponse(JSON.stringify(animeFullFixture));
    const fetchImpl = mockFetch(response);
    await expect(
      createJikanClient({ fetchImpl }).anime.getAnimeFullById(1),
    ).resolves.toEqual(animeFullFixture);
    expect(response.text).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['', 'empty'],
    ['not-json', 'malformed'],
  ])('rejects an %s successful response as a format error', async (body) => {
    const fetchImpl = mockFetch(testResponse(body));
    await expect(
      createJikanClient({ fetchImpl }).top.getTopAnime(),
    ).rejects.toBeInstanceOf(JikanResponseFormatError);
  });

  it.each([
    [400, JikanHttpError],
    [404, JikanNotFoundError],
    [429, JikanRateLimitError],
    [500, JikanServiceUnavailableError],
    [502, JikanServiceUnavailableError],
    [503, JikanServiceUnavailableError],
    [504, JikanServiceUnavailableError],
  ])('maps HTTP %i explicitly', async (status, ErrorType) => {
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify({ status }), { status }),
    );
    await expect(
      createJikanClient({ fetchImpl }).top.getTopAnime(),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it('preserves a sanitized BadResponseException diagnostic for HTTP 504', async () => {
    const payload = {
      status: 504,
      type: 'BadResponseException',
      message: 'Jikan failed to connect to MyAnimeList.',
      error: 'Upstream timed out.',
    };
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify(payload), { status: 504 }),
    );
    await expect(
      createJikanClient({ fetchImpl }).top.getTopAnime(),
    ).rejects.toMatchObject({
      status: 504,
      diagnostic: { response: payload },
    });
  });

  it('limits large response diagnostics', async () => {
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify({ message: 'x'.repeat(1_000) }), {
        status: 400,
      }),
    );
    const request = createJikanClient({ fetchImpl }).top.getTopAnime();
    await expect(request).rejects.toBeInstanceOf(JikanHttpError);
    await request.catch((error: unknown) => {
      expect(
        error instanceof JikanHttpError
          ? error.diagnostic.response?.message
          : undefined,
      ).toHaveLength(500);
    });
  });

  it('reads Retry-After expressed as seconds', async () => {
    const fetchImpl = mockFetch(
      testResponse('{}', {
        status: 429,
        headers: { 'Retry-After': '2' },
      }),
    );
    await expect(
      createJikanClient({ fetchImpl }).top.getTopAnime(),
    ).rejects.toMatchObject({ retryAfterMs: 2_000 });
  });

  it('reads Retry-After expressed as an HTTP date', async () => {
    const now = Date.parse('2026-08-06T12:00:00.000Z');
    const fetchImpl = mockFetch(
      testResponse('{}', {
        status: 503,
        headers: { 'Retry-After': 'Thu, 06 Aug 2026 12:00:05 GMT' },
      }),
    );
    await expect(
      createJikanClient({ fetchImpl, now: () => now }).top.getTopAnime(),
    ).rejects.toMatchObject({ retryAfterMs: 5_000 });
  });

  it('aborts a request when its timeout expires', async () => {
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
    const request = createJikanClient({
      fetchImpl,
      timeoutMs: 25,
    }).top.getTopAnime();
    const assertion = expect(request).rejects.toBeInstanceOf(JikanTimeoutError);
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
    jest.useRealTimers();
  });

  it('supports cancellation with an injected AbortSignal', async () => {
    const controller = new AbortController();
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
    const request = createJikanClient({
      fetchImpl,
      signal: controller.signal,
    }).top.getTopAnime();
    const assertion = expect(request).rejects.toBeInstanceOf(JikanTimeoutError);
    controller.abort();
    await assertion;
  });

  it('maps a fetch TypeError as a network failure', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as jest.MockedFunction<typeof fetch>;
    await expect(
      createJikanClient({ fetchImpl }).top.getTopAnime(),
    ).rejects.toBeInstanceOf(JikanNetworkError);
  });
});

describe('Jikan request retry policy', () => {
  const request = (
    operation: () => Promise<unknown>,
    options: Parameters<typeof executeJikanRequest>[2] = {},
  ) => executeJikanRequest(operation, isJikanSingleAnimeResponse, options);

  it.each([
    new JikanHttpError(400),
    new JikanNotFoundError(),
    new JikanResponseFormatError(),
  ])('does not retry a permanent %s', async (error) => {
    const operation = jest.fn(async () => Promise.reject(error));
    await expect(request(operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([
    new JikanRateLimitError(null),
    new JikanServiceUnavailableError(504, null),
    new JikanTimeoutError(),
    new JikanNetworkError(),
  ])('retries a temporary %s and succeeds later', async (error) => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(animeFullFixture);
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    await expect(
      request(operation, { random: () => 0, sleep }),
    ).resolves.toEqual(animeFullFixture);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('limits requests to three total attempts', async () => {
    const error = new JikanServiceUnavailableError(504, null);
    const operation = jest.fn(async () => Promise.reject(error));
    await expect(
      request(operation, { sleep: async () => undefined }),
    ).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('prioritizes Retry-After over calculated backoff', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new JikanRateLimitError(7_250))
      .mockResolvedValueOnce(animeFullFixture);
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    await request(operation, { random: () => 1, sleep });
    expect(sleep).toHaveBeenCalledWith(7_250);
  });

  it('uses bounded exponential stages and deterministic jitter', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new JikanServiceUnavailableError(504, null))
      .mockRejectedValueOnce(new JikanServiceUnavailableError(504, null))
      .mockResolvedValueOnce(animeFullFixture);
    const sleep = jest.fn(async (_milliseconds: number) => undefined);
    await request(operation, { random: () => 0.5, sleep });
    expect(sleep.mock.calls.map(([delay]) => delay)).toEqual([2_500, 6_000]);
  });

  it('runs every sequential attempt through the injected scheduler boundary', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new JikanTimeoutError())
      .mockResolvedValueOnce(animeFullFixture);
    const runAttempt = jest.fn(
      async (_attempt: number, currentOperation: () => Promise<unknown>) =>
        currentOperation(),
    );
    await request(operation, {
      runAttempt,
      sleep: async () => undefined,
    });
    expect(runAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([0, 1]);
  });
});
