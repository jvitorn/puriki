import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: jest.fn(async () => body),
  } as unknown as Response;
}

function validBody(url: string): string {
  return url.includes('/anime/1/full') ? '{"data":{}}' : '{"data":[]}';
}

function scheduler(): JikanRequestScheduler {
  return new JikanRequestScheduler({ requestIntervalMs: 0 });
}

describe('Jikan multi-endpoint diagnostic', () => {
  it('tests five raw endpoints sequentially and reports healthy', async () => {
    let active = 0;
    let maximumActive = 0;
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return response(validBody(String(input)));
    });
    await expect(
      runJikanConnectivityDiagnostic({
        baseUrl: 'https://example.test/v4/',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        scheduler: scheduler(),
      }),
    ).resolves.toMatchObject({
      health: 'healthy',
      endpoints: [
        { operation: 'details', ok: true, status: 200 },
        { operation: 'popular', ok: true, status: 200 },
        { operation: 'seasonal', ok: true, status: 200 },
        { operation: 'upcoming', ok: true, status: 200 },
        { operation: 'search', ok: true, status: 200 },
      ],
    });
    expect(maximumActive).toBe(1);
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      'https://example.test/v4/anime/1/full',
      'https://example.test/v4/top/anime?limit=1&sfw=true',
      'https://example.test/v4/seasons/now?limit=1&sfw=true',
      'https://example.test/v4/seasons/upcoming?limit=1&sfw=true',
      'https://example.test/v4/anime?limit=1&q=Naruto&sfw=true',
    ]);
  });

  it('reports partial degradation when Popular fails but other endpoints work', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/top/anime')
        ? response('{"status":504}', 504)
        : response(validBody(url));
    });
    const result = await runJikanConnectivityDiagnostic({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduler: scheduler(),
    });
    expect(result.health).toBe('degraded');
    expect(result.endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ operation: 'popular', status: 504 }),
        expect.objectContaining({ operation: 'details', status: 200 }),
        expect.objectContaining({ operation: 'seasonal', status: 200 }),
      ]),
    );
  });

  it('reports unavailable when every endpoint has a network failure', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const result = await runJikanConnectivityDiagnostic({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduler: scheduler(),
    });
    expect(result.health).toBe('unavailable');
    expect(result.endpoints).toHaveLength(5);
    expect(result.endpoints.every((endpoint) => !endpoint.ok)).toBe(true);
    expect(
      result.endpoints.every(({ errorKind }) => errorKind === 'network'),
    ).toBe(true);
  });

  it('reports rate limiting and skips the remaining endpoint requests', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/top/anime')
        ? response('{"status":429}', 429)
        : response(validBody(url));
    });
    const result = await runJikanConnectivityDiagnostic({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduler: scheduler(),
    });
    expect(result.health).toBe('rate_limited');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.endpoints).toHaveLength(5);
    expect(result.endpoints[1]).toMatchObject({
      operation: 'popular',
      status: 429,
      errorKind: 'rate_limit',
    });
    expect(result.endpoints[2]).toMatchObject({
      operation: 'seasonal',
      status: null,
      errorKind: 'rate_limit',
    });
  });

  it('classifies malformed successful JSON as a format failure', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/top/anime')
        ? response('not-json')
        : response(validBody(url));
    });
    const result = await runJikanConnectivityDiagnostic({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduler: scheduler(),
    });
    expect(result.health).toBe('degraded');
    expect(result.endpoints[1]).toMatchObject({
      operation: 'popular',
      errorKind: 'format',
      status: 200,
    });
  });

  it('classifies a missing stable detail resource as diagnostic configuration', async () => {
    const fetchImpl = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return url.includes('/anime/1/full')
        ? response('{"status":404}', 404)
        : response(validBody(url));
    });
    const result = await runJikanConnectivityDiagnostic({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      scheduler: scheduler(),
    });
    expect(result.health).toBe('degraded');
    expect(result.endpoints[0]).toMatchObject({
      operation: 'details',
      errorKind: 'configuration',
      status: 404,
    });
  });
});
