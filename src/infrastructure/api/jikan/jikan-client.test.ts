import { BASE_URL } from '@tutkli/jikan-ts';
import ky from 'ky';

import animeFullFixture from '@/infrastructure/api/jikan/fixtures/anime-full.json';
import {
  createJikanClient,
  executeJikanRequest,
} from '@/infrastructure/api/jikan/jikan-client';
import { isJikanSingleAnimeResponse } from '@/infrastructure/api/jikan/jikan-dtos';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';

jest.mock('ky', () => ({
  __esModule: true,
  default: {
    create: jest.fn(() => ({})),
  },
}));

function httpError(status: number, retryAfter: string | null = null): Error {
  return Object.assign(new Error(`HTTP ${status}`), {
    response: {
      status,
      headers: { get: () => retryAfter },
    },
  });
}

describe('jikan-ts client boundary', () => {
  it('uses the jikan-ts base URL without a GET Content-Type header', () => {
    createJikanClient();
    expect(ky.create).toHaveBeenCalledWith({
      prefixUrl: BASE_URL,
      headers: { Accept: 'application/json' },
      retry: 0,
    });
  });

  it('validates a successful jikan-ts response', async () => {
    await expect(
      executeJikanRequest(
        async () => animeFullFixture,
        isJikanSingleAnimeResponse,
      ),
    ).resolves.toEqual(animeFullFixture);
  });

  it('rejects an unsupported response without retrying it', async () => {
    const operation = jest.fn(async () => ({ data: null }));
    await expect(
      executeJikanRequest(operation, isJikanSingleAnimeResponse),
    ).rejects.toBeInstanceOf(JikanResponseFormatError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it.each([
    [404, JikanNotFoundError],
    [500, JikanServiceUnavailableError],
    [503, JikanServiceUnavailableError],
    [400, JikanHttpError],
  ])('maps HTTP %i from jikan-ts', async (status, ErrorType) => {
    await expect(
      executeJikanRequest(
        async () => Promise.reject(httpError(status)),
        isJikanSingleAnimeResponse,
        { maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(ErrorType);
  });

  it('maps rate limits and keeps Retry-After metadata', async () => {
    await expect(
      executeJikanRequest(
        async () => Promise.reject(httpError(429, '2')),
        isJikanSingleAnimeResponse,
        { maxRetries: 0 },
      ),
    ).rejects.toMatchObject({ retryAfterMs: 2_000 });
  });

  it('maps the timeout emitted by the jikan-ts ky transport', async () => {
    const error = new Error('timed out');
    error.name = 'TimeoutError';
    await expect(
      executeJikanRequest(
        async () => Promise.reject(error),
        isJikanSingleAnimeResponse,
        { maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(JikanTimeoutError);
  });

  it('maps malformed JSON and fetch network errors', async () => {
    await expect(
      executeJikanRequest(
        async () => Promise.reject(new SyntaxError('bad json')),
        isJikanSingleAnimeResponse,
        { maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(JikanResponseFormatError);
    await expect(
      executeJikanRequest(
        async () => Promise.reject(new TypeError('fetch failed')),
        isJikanSingleAnimeResponse,
        { maxRetries: 0 },
      ),
    ).rejects.toBeInstanceOf(JikanNetworkError);
  });

  it('retries a temporary 504 once through the jikan-ts operation', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(httpError(504))
      .mockResolvedValueOnce(animeFullFixture);
    const sleep = jest.fn(async () => undefined);
    const runAttempt = jest.fn(
      async (_attempt: number, currentOperation: () => Promise<unknown>) =>
        currentOperation(),
    );
    await expect(
      executeJikanRequest(operation, isJikanSingleAnimeResponse, {
        runAttempt,
        sleep,
      }),
    ).resolves.toEqual(animeFullFixture);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(runAttempt.mock.calls.map(([attempt]) => attempt)).toEqual([0, 1]);
    expect(sleep).toHaveBeenCalledWith(3_000);
  });
});
