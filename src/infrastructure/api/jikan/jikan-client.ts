import { BASE_URL, JikanClient } from '@tutkli/jikan-ts';
import type {
  AnimeSearchParams,
  AnimeTopParams,
  JikanSeasonsParams,
  SeasonNowParams,
} from '@tutkli/jikan-ts/types';
import ky from 'ky';

import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';

export interface JikanRequestOptions {
  maxRetries?: number;
  runAttempt?: (
    attempt: number,
    operation: () => Promise<unknown>,
  ) => Promise<unknown>;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface JikanClientPort {
  anime: {
    getAnimeFullById(id: number): Promise<unknown>;
    getAnimeSearch(params?: Partial<AnimeSearchParams>): Promise<unknown>;
  };
  seasons: {
    getSeasonNow(params?: Partial<SeasonNowParams>): Promise<unknown>;
    getSeasonUpcoming(params?: Partial<JikanSeasonsParams>): Promise<unknown>;
  };
  top: {
    getTopAnime(params?: Partial<AnimeTopParams>): Promise<unknown>;
  };
}

interface ResponseLike {
  status: number;
  headers?: {
    get(name: string): string | null;
  };
  clone?: () => {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
}

function hasResponse(error: unknown): error is { response: ResponseLike } {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return false;
  }
  const response = error.response;
  return (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof response.status === 'number'
  );
}

function retryAfterMilliseconds(response: ResponseLike): number | null {
  const value = response.headers?.get('Retry-After') ?? null;
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : null;
}

function mapClientError(error: unknown): unknown {
  if (error instanceof JikanResponseFormatError) return error;
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new JikanTimeoutError();
  }
  if (hasResponse(error)) {
    const { status } = error.response;
    const retryAfterMs = retryAfterMilliseconds(error.response);
    if (status === 404) return new JikanNotFoundError();
    if (status === 429) return new JikanRateLimitError(retryAfterMs);
    if ([500, 502, 503, 504].includes(status)) {
      return new JikanServiceUnavailableError(status, retryAfterMs);
    }
    return new JikanHttpError(status);
  }
  if (error instanceof SyntaxError) {
    return new JikanResponseFormatError('Jikan returned malformed JSON.');
  }
  if (error instanceof TypeError) {
    return new JikanNetworkError(error.message);
  }
  return error;
}

function requestUrl(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('request' in error)) {
    return undefined;
  }
  const request = error.request;
  return typeof request === 'object' &&
    request !== null &&
    'url' in request &&
    typeof request.url === 'string'
    ? request.url
    : undefined;
}

async function responseDiagnostic(error: unknown): Promise<unknown> {
  if (!hasResponse(error) || !error.response.clone) return undefined;
  try {
    const value = await error.response.clone().json?.();
    if (typeof value !== 'object' || value === null) return value;
    const record = value as Record<string, unknown>;
    return {
      status: record.status,
      type: record.type,
      message: record.message,
      error: record.error,
    };
  } catch {
    try {
      const text = await error.response.clone().text?.();
      return text ? text.slice(0, 500) : undefined;
    } catch {
      return undefined;
    }
  }
}

async function reportFailedAttempt(
  original: unknown,
  mapped: unknown,
  attempt: number,
  maximumAttempts: number,
): Promise<void> {
  if (process.env.NODE_ENV !== 'development') return;
  console.warn('[Jikan] request attempt failed', {
    timestamp: new Date().toISOString(),
    attempt,
    maximumAttempts,
    message: mapped instanceof Error ? mapped.message : String(mapped),
    status:
      mapped instanceof JikanRateLimitError
        ? 429
        : mapped instanceof JikanServiceUnavailableError ||
            mapped instanceof JikanHttpError
          ? mapped.status
          : undefined,
    url: requestUrl(original),
    cacheStatus: hasResponse(original)
      ? original.response.headers?.get('X-Cache-Status')
      : undefined,
    response: await responseDiagnostic(original),
  });
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof JikanRateLimitError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanNetworkError ||
    error instanceof JikanTimeoutError
  );
}

function retryDelay(error: unknown, attempt: number): number {
  if (
    (error instanceof JikanRateLimitError ||
      error instanceof JikanServiceUnavailableError) &&
    error.retryAfterMs !== null
  ) {
    return error.retryAfterMs;
  }
  if (error instanceof JikanRateLimitError) {
    return Math.min(5_000 * 2 ** attempt, 15_000);
  }
  if (error instanceof JikanServiceUnavailableError) {
    return Math.min(3_000 * 2 ** attempt, 8_000);
  }
  return Math.min(1_000 * 2 ** attempt, 4_000);
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function createJikanClient(): JikanClientPort {
  const transport = ky.create({
    prefixUrl: BASE_URL,
    headers: { Accept: 'application/json' },
    retry: 0,
  });
  return new JikanClient({
    enableLogging: process.env.NODE_ENV === 'development',
    kyInstance: transport,
  });
}

export async function executeJikanRequest<T>(
  operation: () => Promise<unknown>,
  validator: (value: unknown) => value is T,
  options: JikanRequestOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 1;
  const runAttempt =
    options.runAttempt ?? ((_attempt, currentOperation) => currentOperation());
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 0;
  while (true) {
    try {
      const response = await runAttempt(attempt, operation);
      if (!validator(response)) throw new JikanResponseFormatError();
      return response;
    } catch (error: unknown) {
      const mapped = mapClientError(error);
      await reportFailedAttempt(error, mapped, attempt + 1, maxRetries + 1);
      if (!isRetryable(mapped) || attempt >= maxRetries) throw mapped;
      await sleep(retryDelay(mapped, attempt));
      attempt += 1;
    }
  }
}
