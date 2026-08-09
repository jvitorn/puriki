import {
  ANILIST_DIAGNOSTIC_TIMEOUT_MS,
  ANILIST_GRAPHQL_ENDPOINT,
  AniListClient,
  AniListDiagnosticClient,
  executeAniListRequest,
  parseAniListRateLimitHeaders,
  utf8ByteLength,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListDiagnosticError,
  AniListGraphQLValidationError,
  AniListHttpError,
  AniListNotFoundError,
  AniListRateLimitError,
  AniListResponseFormatError,
  AniListServiceUnavailableError,
  AniListTimeoutError,
} from '@/infrastructure/api/anilist/anilist-errors';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';
import { anilistResponse } from '@/infrastructure/api/anilist/anilist-test-fixtures';

describe('AniListDiagnosticClient', () => {
  it('posts a public GraphQL request and measures UTF-8 JSON bytes', async () => {
    const body = { data: { title: '葬送のフリーレン' } };
    const responseText = JSON.stringify(body);
    const fetchImpl = jest.fn(async () =>
      anilistResponse(body, 200, {
        'X-RateLimit-Limit': '30',
        'X-RateLimit-Remaining': '29',
      }),
    );
    const logger = jest.fn();
    const now = jest
      .fn<ReturnType<typeof Date.now>, Parameters<typeof Date.now>>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_125)
      .mockReturnValue(1_125);
    const client = new AniListDiagnosticClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger,
      now,
    });

    await expect(
      client.execute({
        testName: 'connectivity',
        query: 'query Test { Viewer { id } }',
        variables: { page: 1 },
      }),
    ).resolves.toMatchObject({
      data: body.data,
      graphqlErrors: [],
      status: 200,
      elapsedMs: 125,
      responseBytes: utf8ByteLength(responseText),
      rateLimit: { limit: 30, remaining: 29 },
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      ANILIST_GRAPHQL_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: 'query Test { Viewer { id } }',
          variables: { page: 1 },
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining('connectivity status=200 elapsed=125ms'),
    );
    expect(utf8ByteLength('Aé葬😀')).toBe(10);
  });

  it('preserves GraphQL errors and partial data from HTTP 200', async () => {
    const client = new AniListDiagnosticClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({
          data: { Media: { id: 1 } },
          errors: [{ message: 'A field was unavailable' }, {}],
        }),
      ) as unknown as typeof fetch,
      logger: jest.fn(),
    });
    await expect(
      client.execute({
        testName: 'details',
        query: 'query Details { Media { id } }',
      }),
    ).resolves.toMatchObject({
      data: { Media: { id: 1 } },
      graphqlErrors: [
        'A field was unavailable',
        'AniList returned an unknown GraphQL error.',
      ],
    });
  });

  it('parses dynamic limit, remaining, Retry-After and reset headers', () => {
    const values: Record<string, string> = {
      'x-ratelimit-limit': '47',
      'x-ratelimit-remaining': '11',
      'retry-after': 'Sun, 09 Aug 2026 15:00:05 GMT',
      'x-ratelimit-reset': '1786287605',
    };
    expect(
      parseAniListRateLimitHeaders(
        { get: (name) => values[name.toLowerCase()] ?? null },
        Date.parse('2026-08-09T15:00:00Z'),
      ),
    ).toEqual({
      limit: 47,
      remaining: 11,
      retryAfterSeconds: 5,
      resetAt: 1_786_287_605,
    });
    expect(parseAniListRateLimitHeaders({ get: () => 'invalid' }, 0)).toEqual({
      limit: null,
      remaining: null,
      retryAfterSeconds: null,
      resetAt: null,
    });
  });

  it('classifies 429 before attempting retries and keeps rate metrics', async () => {
    const client = new AniListDiagnosticClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ errors: [{ message: 'Too many requests' }] }, 429, {
          'Retry-After': '8.2',
          'X-RateLimit-Remaining': '0',
        }),
      ) as unknown as typeof fetch,
      logger: jest.fn(),
    });
    const promise = client.execute({
      testName: 'popular',
      query: 'query P { Page { media { id } } }',
    });
    await expect(promise).rejects.toMatchObject({
      kind: 'rate_limit',
      message: 'Too many requests',
      metrics: {
        status: 429,
        rateLimit: { remaining: 0, retryAfterSeconds: 9 },
      },
    });
  });

  it.each([
    ['not-json', 200, 'format'],
    ['not-json', 503, 'http'],
    ['not-json', 429, 'rate_limit'],
    [{ errors: [{ message: 'Down' }] }, 500, 'http'],
    [[], 200, 'format'],
  ] as const)(
    'classifies body %p with status %i as %s',
    async (body, status, kind) => {
      const client = new AniListDiagnosticClient({
        fetchImpl: jest.fn(async () =>
          anilistResponse(body, status),
        ) as unknown as typeof fetch,
        logger: jest.fn(),
      });
      await expect(
        client.execute({
          testName: 'test',
          query: 'query Test { Page { pageInfo { currentPage } } }',
        }),
      ).rejects.toMatchObject({ kind, metrics: { status } });
    },
  );

  it('classifies network and 12-second timeout failures separately', async () => {
    const networkClient = new AniListDiagnosticClient({
      fetchImpl: jest.fn(async () => {
        throw new TypeError('Network request failed');
      }) as unknown as typeof fetch,
      logger: jest.fn(),
    });
    await expect(
      networkClient.execute({
        testName: 'search',
        query: 'query Search { Page { media { id } } }',
      }),
    ).rejects.toMatchObject({ kind: 'network', metrics: { status: null } });

    const clearTimeoutImpl = jest.fn();
    const timeoutClient = new AniListDiagnosticClient({
      fetchImpl: jest.fn(async (_input, init) => {
        if (init?.signal?.aborted) throw new Error('aborted');
        throw new Error('expected aborted signal');
      }) as unknown as typeof fetch,
      setTimeoutImpl: ((handler: TimerHandler, timeout?: number) => {
        expect(timeout).toBe(ANILIST_DIAGNOSTIC_TIMEOUT_MS);
        if (typeof handler === 'function') handler();
        return 42;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: clearTimeoutImpl as unknown as typeof clearTimeout,
      logger: jest.fn(),
    });
    await expect(
      timeoutClient.execute({
        testName: 'details',
        query: 'query Details { Media { id } }',
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(clearTimeoutImpl).toHaveBeenCalled();
  });

  it('exposes typed diagnostic errors with all metrics', () => {
    const error = new AniListDiagnosticError('http', 'failed', {
      status: 502,
      elapsedMs: 10,
      responseBytes: 2,
      rateLimit: {
        limit: null,
        remaining: null,
        retryAfterSeconds: null,
        resetAt: null,
      },
      graphqlErrors: [],
    });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AniListDiagnosticError');
    expect(error.kind).toBe('http');
  });
});

describe('AniList production client', () => {
  it('posts GraphQL variables and preserves partial alias errors', async () => {
    const fetchImpl = jest.fn(async () =>
      anilistResponse({
        data: { popular: { media: [] }, upcoming: null },
        errors: [
          {
            message: 'Upcoming failed',
            path: ['upcoming', 'media', 0],
          },
        ],
      }),
    );
    const client = new AniListClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(
      client.execute({
        key: 'home',
        query: 'query Home($page: Int!) { Page(page: $page) { media { id } } }',
        variables: { page: 1 },
      }),
    ).resolves.toMatchObject({
      status: 200,
      errors: [{ message: 'Upcoming failed', path: ['upcoming', 'media', 0] }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      ANILIST_GRAPHQL_ENDPOINT,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          query:
            'query Home($page: Int!) { Page(page: $page) { media { id } } }',
          variables: { page: 1 },
        }),
      }),
    );
  });

  it('maps 429 headers and blocks the shared coordinator without retry', async () => {
    let now = 1_000;
    const fetchImpl = jest.fn(async () =>
      anilistResponse({ errors: [{ message: 'Slow down' }] }, 429, {
        'Retry-After': '2',
        'X-RateLimit-Limit': '30',
        'X-RateLimit-Remaining': '0',
      }),
    );
    const coordinator = new AniListRequestCoordinator({ now: () => now });
    const client = new AniListClient({
      coordinator,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => now,
    });

    await expect(
      executeAniListRequest(client, { key: 'one', query: 'query One { x }' }),
    ).rejects.toMatchObject({
      failureKind: 'rate_limit',
      retryAfterMs: 2_000,
    });
    await expect(
      client.execute({ key: 'two', query: 'query Two { x }' }),
    ).rejects.toBeInstanceOf(AniListRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 3_001;
    await expect(
      client.execute({ key: 'three', query: 'query Three { x }' }),
    ).rejects.toBeInstanceOf(AniListRateLimitError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('recognizes only semantic temporary-disable 403 responses', async () => {
    const temporary = new AniListClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse(
          { errors: [{ message: 'The API is temporarily disabled' }] },
          403,
        ),
      ) as unknown as typeof fetch,
    });
    await expect(
      temporary.execute({ key: 'temporary', query: 'query T { x }' }),
    ).rejects.toBeInstanceOf(AniListServiceUnavailableError);

    const arbitrary = new AniListClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ errors: [{ message: 'Forbidden field' }] }, 403),
      ) as unknown as typeof fetch,
    });
    await expect(
      arbitrary.execute({ key: 'forbidden', query: 'query F { x }' }),
    ).rejects.toBeInstanceOf(AniListHttpError);
  });

  it.each([
    [400, AniListGraphQLValidationError],
    [404, AniListNotFoundError],
    [500, AniListServiceUnavailableError],
  ])('maps HTTP %s explicitly', async (status, ErrorType) => {
    const client = new AniListClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse({ errors: [{ message: 'failed' }] }, status),
      ) as unknown as typeof fetch,
    });
    await expect(
      client.execute({ key: String(status), query: 'query T { x }' }),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it('retries only network, timeout, and supported 5xx classes with two attempts', async () => {
    const sleep = jest.fn(async () => undefined);
    const retryingClient = {
      execute: jest
        .fn()
        .mockRejectedValueOnce(new AniListServiceUnavailableError(503))
        .mockResolvedValueOnce({ data: {}, errors: [], status: 200 }),
    };
    await executeAniListRequest(
      retryingClient,
      { key: 'retry', query: 'query Retry { x }' },
      { sleep },
    );
    expect(retryingClient.execute).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);

    const validationClient = {
      execute: jest.fn(async () => {
        throw new AniListGraphQLValidationError();
      }),
    };
    await expect(
      executeAniListRequest(validationClient, {
        key: 'validation',
        query: 'query Bad { x }',
      }),
    ).rejects.toBeInstanceOf(AniListGraphQLValidationError);
    expect(validationClient.execute).toHaveBeenCalledTimes(1);
  });

  it('maps malformed success payloads and the 12-second timeout', async () => {
    const malformed = new AniListClient({
      fetchImpl: jest.fn(async () =>
        anilistResponse('not-json'),
      ) as unknown as typeof fetch,
    });
    await expect(
      malformed.execute({ key: 'malformed', query: 'query M { x }' }),
    ).rejects.toBeInstanceOf(AniListResponseFormatError);

    const timeout = new AniListClient({
      fetchImpl: jest.fn(async () => {
        throw new Error('aborted');
      }) as unknown as typeof fetch,
      setTimeoutImpl: ((handler: TimerHandler, milliseconds?: number) => {
        expect(milliseconds).toBe(12_000);
        if (typeof handler === 'function') handler();
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: jest.fn() as unknown as typeof clearTimeout,
    });
    await expect(
      timeout.execute({ key: 'timeout', query: 'query T { x }' }),
    ).rejects.toBeInstanceOf(AniListTimeoutError);
  });
});
