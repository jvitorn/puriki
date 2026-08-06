import { Platform } from 'react-native';

import {
  JIKAN_BASE_URL,
  normalizeJikanBaseUrl,
} from '@/infrastructure/api/jikan/jikan-config';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
  type JikanRequestDiagnostic,
  type JikanResponseDiagnostic,
} from '@/infrastructure/api/jikan/jikan-errors';

const DEFAULT_TIMEOUT_MS = 12_000;
const MAXIMUM_ATTEMPTS = 3;
const MAX_DIAGNOSTIC_LENGTH = 500;

type QueryParameter = string | number | boolean | null | undefined;
export type JikanQueryParameters = Record<string, QueryParameter>;

interface PaginationParams {
  [key: string]: QueryParameter;
  page?: number;
  limit?: number;
  sfw?: boolean;
}

export interface AnimeSearchParams extends PaginationParams {
  q?: string;
  order_by?: string;
  sort?: 'asc' | 'desc';
}

export interface SeasonNowParams extends PaginationParams {
  filter?: string;
}

export type SeasonUpcomingParams = PaginationParams;

export interface TopAnimeParams extends PaginationParams {
  filter?: string;
  rating?: string;
  type?: string;
}

export interface JikanClientPort {
  anime: {
    getAnimeFullById(id: number): Promise<unknown>;
    getAnimeSearch(params?: AnimeSearchParams): Promise<unknown>;
  };
  seasons: {
    getSeasonNow(params?: SeasonNowParams): Promise<unknown>;
    getSeasonUpcoming(params?: SeasonUpcomingParams): Promise<unknown>;
  };
  top: {
    getTopAnime(params?: TopAnimeParams): Promise<unknown>;
  };
}

export interface NativeJikanClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  signal?: AbortSignal;
}

export interface NativeJikanResponse {
  data: unknown;
  status: number;
  elapsedMs: number;
  cacheStatus: string | null;
  url: string;
}

export interface NativeJikanTransport {
  get(
    key: string,
    path: string,
    params?: JikanQueryParameters,
  ): Promise<NativeJikanResponse>;
}

export interface JikanRequestOptions {
  maximumAttempts?: number;
  maxRetries?: number;
  key?: string;
  runAttempt?: (
    attempt: number,
    operation: () => Promise<unknown>,
  ) => Promise<unknown>;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

interface ParsedBody {
  parsed: boolean;
  value: unknown;
}

interface ResponseLike {
  status: number;
  headers?: {
    get(name: string): string | null;
  };
}

function isResponseError(error: unknown): error is { response: ResponseLike } {
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

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
  );
}

function isMappedJikanError(error: unknown): boolean {
  return (
    error instanceof JikanHttpError ||
    error instanceof JikanNetworkError ||
    error instanceof JikanNotFoundError ||
    error instanceof JikanRateLimitError ||
    error instanceof JikanResponseFormatError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanTimeoutError
  );
}

export function safelyParseJson(text: string): unknown {
  return JSON.parse(text) as unknown;
}

function parseBody(text: string): ParsedBody {
  if (text.length === 0) return { parsed: false, value: undefined };
  try {
    return { parsed: true, value: safelyParseJson(text) };
  } catch {
    return { parsed: false, value: undefined };
  }
}

function truncated(value: string): string {
  return value.slice(0, MAX_DIAGNOSTIC_LENGTH);
}

function sanitizeUnknown(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return value;
  }
  if (typeof value === 'string') return truncated(value);
  try {
    return truncated(JSON.stringify(value));
  } catch {
    return '[Unserializable response data]';
  }
}

function responseDiagnostic(
  status: number,
  body: ParsedBody,
  rawText: string,
): JikanResponseDiagnostic {
  if (
    body.parsed &&
    typeof body.value === 'object' &&
    body.value !== null &&
    !Array.isArray(body.value)
  ) {
    const record = body.value as Record<string, unknown>;
    return {
      status: typeof record.status === 'number' ? record.status : status,
      type:
        typeof record.type === 'string' ? truncated(record.type) : undefined,
      message:
        typeof record.message === 'string'
          ? truncated(record.message)
          : undefined,
      error:
        record.error === undefined ? undefined : sanitizeUnknown(record.error),
    };
  }
  return {
    status,
    message: rawText.length > 0 ? truncated(rawText) : undefined,
  };
}

function retryAfterMilliseconds(
  response: ResponseLike,
  now: () => number,
): number | null {
  const value = response.headers?.get('Retry-After')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, timestamp - now());
}

function mapHttpError(
  response: ResponseLike,
  diagnostic: JikanRequestDiagnostic,
  now: () => number,
): Error {
  const retryAfterMs = retryAfterMilliseconds(response, now);
  if (response.status === 404) {
    return new JikanNotFoundError(undefined, diagnostic);
  }
  if (response.status === 429) {
    return new JikanRateLimitError(retryAfterMs, undefined, diagnostic);
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    return new JikanServiceUnavailableError(
      response.status,
      retryAfterMs,
      undefined,
      diagnostic,
    );
  }
  return new JikanHttpError(response.status, undefined, diagnostic);
}

function mapClientError(error: unknown): unknown {
  if (isMappedJikanError(error)) return error;
  if (
    hasErrorName(error, 'AbortError') ||
    hasErrorName(error, 'TimeoutError')
  ) {
    return new JikanTimeoutError();
  }
  if (isResponseError(error)) {
    return mapHttpError(
      error.response,
      { status: error.response.status },
      Date.now,
    );
  }
  if (error instanceof SyntaxError) {
    return new JikanResponseFormatError('Jikan returned malformed JSON.');
  }
  if (error instanceof TypeError) return new JikanNetworkError(error.message);
  return error;
}

export function buildJikanUrl(
  baseUrl: string,
  path: string,
  params?: JikanQueryParameters,
): string {
  const normalizedBaseUrl = normalizeJikanBaseUrl(baseUrl);
  const normalizedPath = path.replace(/^\/+/, '');
  const query = Object.entries(params ?? {})
    .filter((entry): entry is [string, string | number | boolean] => {
      const value = entry[1];
      return value !== undefined && value !== null;
    })
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
    )
    .join('&');
  const url = `${normalizedBaseUrl}/${normalizedPath}`;
  return query.length > 0 ? `${url}?${query}` : url;
}

function errorKind(error: unknown): string {
  if (error instanceof JikanTimeoutError) return 'timeout';
  if (error instanceof JikanNetworkError) return 'network';
  if (
    error instanceof JikanHttpError ||
    error instanceof JikanNotFoundError ||
    error instanceof JikanRateLimitError ||
    error instanceof JikanServiceUnavailableError
  ) {
    return 'http';
  }
  if (error instanceof JikanResponseFormatError) return 'format';
  return 'unknown';
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof JikanRateLimitError) return 429;
  if (
    error instanceof JikanHttpError ||
    error instanceof JikanServiceUnavailableError
  ) {
    return error.status;
  }
  if (error instanceof JikanNotFoundError) return 404;
  return error instanceof JikanResponseFormatError ||
    error instanceof JikanNetworkError ||
    error instanceof JikanTimeoutError
    ? error.diagnostic.status
    : undefined;
}

function errorDiagnostic(error: unknown): JikanRequestDiagnostic {
  return error instanceof JikanHttpError ||
    error instanceof JikanNetworkError ||
    error instanceof JikanNotFoundError ||
    error instanceof JikanRateLimitError ||
    error instanceof JikanResponseFormatError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanTimeoutError
    ? error.diagnostic
    : {};
}

export function createNativeJikanTransport(
  options: NativeJikanClientOptions = {},
): NativeJikanTransport {
  const configuredBaseUrl = normalizeJikanBaseUrl(
    options.baseUrl ?? JIKAN_BASE_URL,
  );
  const baseUrl = configuredBaseUrl || JIKAN_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;

  return {
    async get(key, path, params) {
      const url = buildJikanUrl(baseUrl, path, params);
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      if (options.signal?.aborted) controller.abort();
      else
        options.signal?.addEventListener('abort', forwardAbort, {
          once: true,
        });
      const startedAt = now();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const rawText = await response.text();
        const body = parseBody(rawText);
        const elapsedMs = Math.max(0, now() - startedAt);
        const cacheStatus = response.headers.get('X-Cache-Status');
        const diagnostic: JikanRequestDiagnostic = {
          status: response.status,
          url,
          elapsedMs,
          cacheStatus,
          response: responseDiagnostic(response.status, body, rawText),
        };
        if (!response.ok) throw mapHttpError(response, diagnostic, now);
        if (!body.parsed) {
          throw new JikanResponseFormatError(
            rawText.length === 0
              ? 'Jikan returned an empty successful response.'
              : 'Jikan returned malformed JSON.',
            diagnostic,
          );
        }
        if (process.env.NODE_ENV === 'development') {
          console.info('[Jikan] request succeeded', {
            platform: Platform.OS,
            key,
            status: response.status,
            elapsedMs,
            cacheStatus,
            url,
          });
        }
        return {
          data: body.value,
          status: response.status,
          elapsedMs,
          cacheStatus,
          url,
        };
      } catch (error: unknown) {
        if (isMappedJikanError(error)) throw error;
        const diagnostic: JikanRequestDiagnostic = {
          url,
          elapsedMs: Math.max(0, now() - startedAt),
        };
        if (controller.signal.aborted || hasErrorName(error, 'AbortError')) {
          throw new JikanTimeoutError(undefined, diagnostic);
        }
        if (error instanceof TypeError) {
          throw new JikanNetworkError(error.message, diagnostic);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', forwardAbort);
      }
    },
  };
}

export function createJikanClient(
  options: NativeJikanClientOptions = {},
): JikanClientPort {
  const transport = createNativeJikanTransport(options);
  const getData = async (
    key: string,
    path: string,
    params?: JikanQueryParameters,
  ): Promise<unknown> => (await transport.get(key, path, params)).data;
  return {
    anime: {
      getAnimeFullById: (id) =>
        getData(
          `detail:${id}`,
          `/anime/${encodeURIComponent(String(id))}/full`,
        ),
      getAnimeSearch: (params) => getData('search', '/anime', params),
    },
    seasons: {
      getSeasonNow: (params) => getData('seasonal', '/seasons/now', params),
      getSeasonUpcoming: (params) =>
        getData('upcoming', '/seasons/upcoming', params),
    },
    top: {
      getTopAnime: (params) => getData('popular', '/top/anime', params),
    },
  };
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof JikanRateLimitError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanNetworkError ||
    error instanceof JikanTimeoutError
  );
}

function retryDelay(
  error: unknown,
  failedAttempt: number,
  random: () => number,
): number {
  if (
    (error instanceof JikanRateLimitError ||
      error instanceof JikanServiceUnavailableError) &&
    error.retryAfterMs !== null
  ) {
    return error.retryAfterMs;
  }
  const boundedRandom = Math.min(1, Math.max(0, random()));
  if (error instanceof JikanRateLimitError) {
    return failedAttempt === 0
      ? 5_000 + boundedRandom * 2_000
      : 10_000 + boundedRandom * 3_000;
  }
  if (error instanceof JikanServiceUnavailableError) {
    return failedAttempt === 0
      ? 2_000 + boundedRandom * 1_000
      : 5_000 + boundedRandom * 2_000;
  }
  return failedAttempt === 0
    ? 1_000 + boundedRandom * 1_000
    : 3_000 + boundedRandom * 2_000;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function reportFailedAttempt(
  error: unknown,
  key: string,
  attempt: number,
  maximumAttempts: number,
): void {
  if (process.env.NODE_ENV !== 'development') return;
  const diagnostic = errorDiagnostic(error);
  console.warn('[Jikan] request attempt failed', {
    platform: Platform.OS,
    key,
    attempt,
    maximumAttempts,
    method: 'GET',
    url: diagnostic.url,
    startedAt:
      diagnostic.elapsedMs === undefined
        ? undefined
        : new Date(Date.now() - diagnostic.elapsedMs).toISOString(),
    elapsedMs: diagnostic.elapsedMs,
    status: errorStatus(error),
    retryAfter:
      error instanceof JikanRateLimitError ||
      error instanceof JikanServiceUnavailableError
        ? error.retryAfterMs
        : null,
    cacheStatus: diagnostic.cacheStatus ?? null,
    errorKind: errorKind(error),
    response: diagnostic.response,
  });
}

export async function executeJikanRequest<T>(
  operation: () => Promise<unknown>,
  validator: (value: unknown) => value is T,
  options: JikanRequestOptions = {},
): Promise<T> {
  const configuredAttempts =
    options.maximumAttempts ??
    (options.maxRetries === undefined
      ? MAXIMUM_ATTEMPTS
      : options.maxRetries + 1);
  const maximumAttempts = Math.min(
    MAXIMUM_ATTEMPTS,
    Math.max(1, Math.floor(configuredAttempts)),
  );
  const runAttempt =
    options.runAttempt ?? ((_attempt, currentOperation) => currentOperation());
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const key = options.key ?? 'unknown';

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const response = await runAttempt(attempt, operation);
      if (!validator(response)) throw new JikanResponseFormatError();
      return response;
    } catch (error: unknown) {
      const mapped = mapClientError(error);
      reportFailedAttempt(mapped, key, attempt + 1, maximumAttempts);
      if (!isRetryable(mapped) || attempt + 1 >= maximumAttempts) throw mapped;
      await sleep(retryDelay(mapped, attempt, random));
    }
  }
  throw new Error('Jikan request attempts were exhausted.');
}
