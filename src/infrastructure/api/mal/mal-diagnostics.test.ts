import animeCollectionFixture from '@/infrastructure/api/mal/fixtures/anime-collection.json';
import { runMalConnectivityDiagnostic } from '@/infrastructure/api/mal/mal-diagnostics';

function testResponse(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
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

describe('direct MAL connectivity diagnostic', () => {
  it('calls only the lightweight MAL ranking endpoint and extracts a sample', async () => {
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify(animeCollectionFixture)),
    );
    await expect(
      runMalConnectivityDiagnostic({
        baseUrl: 'https://mal.example.test/v2',
        clientId: 'test-id',
        fetchImpl,
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      errorKind: 'none',
      message: 'MyAnimeList API is operational.',
      sampleAnimeTitle: 'Sousou no Frieren',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://mal.example.test/v2/anime/ranking?fields=id%2Ctitle%2Cmain_picture&limit=1&ranking_type=bypopularity',
    );
    expect(String(fetchImpl.mock.calls[0]?.[0])).not.toContain('jikan');
  });

  it('returns not configured without starting fetch', async () => {
    const fetchImpl = mockFetch(testResponse('{}'));
    await expect(
      runMalConnectivityDiagnostic({ clientId: ' ', fetchImpl }),
    ).resolves.toMatchObject({
      ok: false,
      status: null,
      errorKind: 'not_configured',
      message: 'MyAnimeList Client ID is not configured.',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized', 'MyAnimeList rejected the application Client ID.'],
    [403, 'unauthorized', 'MyAnimeList rejected the application Client ID.'],
    [429, 'rate_limit', 'MyAnimeList is receiving too many requests.'],
    [
      500,
      'service_unavailable',
      'The MyAnimeList API is temporarily unavailable.',
    ],
    [
      503,
      'service_unavailable',
      'The MyAnimeList API is temporarily unavailable.',
    ],
    [400, 'http', 'The MyAnimeList API request failed.'],
  ])(
    'classifies HTTP %i without exposing its response',
    async (status, kind, message) => {
      const response = testResponse(
        JSON.stringify({ message: 'upstream' }),
        status,
      );
      const fetchImpl = mockFetch(response, response);
      await expect(
        runMalConnectivityDiagnostic({
          clientId: 'test-id',
          fetchImpl,
          maximumAttempts: 1,
        }),
      ).resolves.toMatchObject({
        ok: false,
        status,
        errorKind: kind,
        message,
        sampleAnimeTitle: null,
      });
    },
  );

  it('classifies a native network failure', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as jest.MockedFunction<typeof fetch>;
    await expect(
      runMalConnectivityDiagnostic({
        clientId: 'test-id',
        fetchImpl,
        maximumAttempts: 1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      errorKind: 'network',
      message: 'Unable to reach the MyAnimeList API.',
    });
  });

  it('classifies a native timeout', async () => {
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
    const request = runMalConnectivityDiagnostic({
      clientId: 'test-id',
      fetchImpl,
      maximumAttempts: 1,
      timeoutMs: 25,
    });
    await jest.advanceTimersByTimeAsync(25);
    await expect(request).resolves.toMatchObject({
      ok: false,
      errorKind: 'timeout',
      message: 'MyAnimeList took too long to respond.',
    });
    jest.useRealTimers();
  });

  it.each([
    '{}',
    '{"data":[]}',
    '{"data":[{"node":{"id":0,"title":"Invalid"}}]}',
  ])('rejects a successful invalid sample payload', async (body) => {
    const fetchImpl = mockFetch(testResponse(body));
    await expect(
      runMalConnectivityDiagnostic({ clientId: 'test-id', fetchImpl }),
    ).resolves.toMatchObject({
      ok: false,
      errorKind: 'invalid_response',
      message: 'MyAnimeList returned an invalid response.',
    });
  });

  it('bypasses repository cache on every diagnostic run', async () => {
    const fetchImpl = mockFetch(
      testResponse(JSON.stringify(animeCollectionFixture)),
      testResponse(JSON.stringify(animeCollectionFixture)),
    );
    const options = { clientId: 'test-id', fetchImpl };
    await runMalConnectivityDiagnostic(options);
    await runMalConnectivityDiagnostic(options);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
