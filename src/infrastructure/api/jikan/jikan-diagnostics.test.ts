import { runJikanConnectivityDiagnostic } from '@/infrastructure/api/jikan/jikan-diagnostics';

function response(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: jest.fn(async () => body),
  } as unknown as Response;
}

describe('Jikan connectivity diagnostic', () => {
  it('uses the native transport with the minimal top-anime request', async () => {
    const fetchImpl = jest.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        response('{"data":[]}'),
    );
    await expect(
      runJikanConnectivityDiagnostic({
        baseUrl: 'https://example.test/v4/',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      ok: true,
      status: 200,
      errorKind: 'none',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://example.test/v4/top/anime?limit=1&sfw=true',
    );
  });

  it('classifies real HTTP failures without exposing the response body', async () => {
    const fetchImpl = jest.fn(async () =>
      response(
        JSON.stringify({
          status: 504,
          type: 'BadResponseException',
          message: 'Upstream details intended only for development logs.',
        }),
        504,
      ),
    );
    await expect(
      runJikanConnectivityDiagnostic({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 504,
      errorKind: 'http',
      message: 'Jikan is unavailable (HTTP 504).',
    });
  });

  it.each([
    [new TypeError('Network request failed'), 'network'],
    [Object.assign(new Error('aborted'), { name: 'AbortError' }), 'timeout'],
  ])('classifies a transport %s', async (failure, errorKind) => {
    const fetchImpl = jest.fn(async () => Promise.reject(failure));
    await expect(
      runJikanConnectivityDiagnostic({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({ ok: false, status: null, errorKind });
  });

  it('classifies malformed successful JSON as a format failure', async () => {
    const fetchImpl = jest.fn(async () => response('not-json'));
    await expect(
      runJikanConnectivityDiagnostic({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 200,
      errorKind: 'format',
    });
  });
});
