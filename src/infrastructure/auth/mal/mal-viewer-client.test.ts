import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  MAL_VIEWER_ENDPOINT,
  MAL_VIEWER_TIMEOUT_MS,
  MalViewerClient,
} from '@/infrastructure/auth/mal/mal-viewer-client';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    status,
    text: jest.fn(async () => JSON.stringify(body)),
  } as unknown as Response;
}

describe('MalViewerClient', () => {
  it('uses a Bearer token and maps the neutral viewer identity', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({ id: 42, name: 'aiko', picture: 'https://cdn.example.com/aiko.png' }),
    );
    const client = new MalViewerClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(client.getViewer('secret-token')).resolves.toEqual({
      id: 42,
      name: 'aiko',
      avatarUrl: 'https://cdn.example.com/aiko.png',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      MAL_VIEWER_ENDPOINT,
      expect.objectContaining({
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer secret-token',
        },
      }),
    );
  });

  it('accepts an absent picture', async () => {
    const client = new MalViewerClient({
      fetchImpl: jest.fn(async () =>
        jsonResponse({ id: 7, name: 'no-avatar' }),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).resolves.toEqual({
      id: 7,
      name: 'no-avatar',
      avatarUrl: null,
    });
  });

  it.each([
    [401, {}],
    [403, {}],
  ] as const)('classifies status %i as an invalid token', async (status, body) => {
    const client = new MalViewerClient({
      fetchImpl: jest.fn(async () =>
        jsonResponse(body, status),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).rejects.toMatchObject({
      code: 'invalid_token',
      reconnectRequired: true,
    });
  });

  it.each([
    [500, 'provider_unavailable'],
    [429, 'provider_unavailable'],
    [418, 'invalid_response'],
  ] as const)('keeps status %i retryable as %s', async (status, code) => {
    const client = new MalViewerClient({
      fetchImpl: jest.fn(async () =>
        jsonResponse({ error: 'temporary' }, status),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).rejects.toMatchObject({
      code,
      canRetry: true,
    });
  });

  it('classifies network and timeout without returning raw errors', async () => {
    const networkClient = new MalViewerClient({
      fetchImpl: jest.fn(async () => {
        throw new Error('raw network error');
      }) as unknown as typeof fetch,
    });
    await expect(networkClient.getViewer('token')).rejects.toEqual(
      new AuthOperationError('network', { canRetry: true }),
    );

    const timeoutClient = new MalViewerClient({
      fetchImpl: jest.fn(async () => {
        throw new Error('aborted');
      }) as unknown as typeof fetch,
      setTimeoutImpl: ((handler: TimerHandler, timeout?: number) => {
        expect(timeout).toBe(MAL_VIEWER_TIMEOUT_MS);
        if (typeof handler === 'function') handler();
        return 1;
      }) as unknown as typeof setTimeout,
      clearTimeoutImpl: jest.fn() as unknown as typeof clearTimeout,
    });
    await expect(timeoutClient.getViewer('token')).rejects.toEqual(
      new AuthOperationError('timeout', { canRetry: true }),
    );
  });

  it('rejects malformed viewer fields', async () => {
    const client = new MalViewerClient({
      fetchImpl: jest.fn(async () =>
        jsonResponse({ id: '42', name: null }),
      ) as unknown as typeof fetch,
    });
    await expect(client.getViewer('token')).rejects.toMatchObject({
      code: 'invalid_response',
      canRetry: true,
    });
  });
});
