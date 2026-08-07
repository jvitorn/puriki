import { Platform } from 'react-native';

import {
  MAL_BASE_URL,
  MAL_CLIENT_ID,
  isMalClientIdConfigured,
  normalizeMalBaseUrl,
} from '@/infrastructure/api/mal/mal-config';
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
  type MalRequestDiagnostic,
  type MalResponseDiagnostic,
} from '@/infrastructure/api/mal/mal-errors';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAXIMUM_ATTEMPTS = 2;
const MAX_DIAGNOSTIC_LENGTH = 500;
const MAX_RETRY_DELAY_MS = 5_000;

type QueryParameter = string | number | boolean | null | undefined;
export type MalQueryParameters = Record<string, QueryParameter>;

interface MalPaginationParams {
  [key: string]: QueryParameter;
  limit?: number;
  offset?: number;
  fields?: string;
}

export interface MalAnimeSearchParams extends MalPaginationParams {
  q: string;
}

export type MalAnimeRankingType =
  | 'all'
  | 'airing'
  | 'upcoming'
  | 'tv'
  | 'ova'
  | 'movie'
  | 'special'
  | 'bypopularity'
  | 'favorite';

export interface MalAnimeRankingParams extends MalPaginationParams {
  ranking_type: MalAnimeRankingType;
}

export type MalAnimeSeason = 'winter' | 'spring' | 'summer' | 'fall';

export interface MalAnimeSeasonParams extends MalPaginationParams {
  sort?: 'anime_score' | 'anime_num_list_users';
}

export interface MalClientPort {
  anime: {
    search(params: MalAnimeSearchParams): Promise<unknown>;
    getDetails(id: number, fields: string): Promise<unknown>;
    getRanking(params: MalAnimeRankingParams): Promise<unknown>;
    getSeason(
      year: number,
      season: MalAnimeSeason,
      params: MalAnimeSeasonParams,
    ): Promise<unknown>;
  };
}

export interface MalClientOptions {
  clientId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  maximumAttempts?: number;
}

export interface NativeMalResponse {
  data: unknown;
  status: number;
  elapsedMs: number;
  url: string;
}

export interface NativeMalTransport {
  get(
    operation: string,
    path: string,
    params?: MalQueryParameters,
  ): Promise<NativeMalResponse>;
}

interface ParsedBody {
  parsed: boolean;
  value: unknown;
}

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
  );
}

function isMappedMalError(error: unknown): boolean {
  return (
    error instanceof MalConfigurationError ||
    error instanceof MalHttpError ||
    error instanceof MalNetworkError ||
    error instanceof MalNotFoundError ||
    error instanceof MalRateLimitError ||
    error instanceof MalResponseFormatError ||
    error instanceof MalServiceUnavailableError ||
    error instanceof MalTimeoutError ||
    error instanceof MalUnauthorizedError
  );
}

function parseBody(text: string): ParsedBody {
  if (text.length === 0) return { parsed: false, value: undefined };
  try {
    return { parsed: true, value: JSON.parse(text) as unknown };
  } catch {
    return { parsed: false, value: undefined };
  }
}

function truncated(value: string): string {
  return value.slice(0, MAX_DIAGNOSTIC_LENGTH);
}

function responseDiagnostic(
  status: number,
  body: ParsedBody,
  rawText: string,
): MalResponseDiagnostic {
  if (
    body.parsed &&
    typeof body.value === 'object' &&
    body.value !== null &&
    !Array.isArray(body.value)
  ) {
    const record = body.value as Record<string, unknown>;
    return {
      status,
      error:
        typeof record.error === 'string' ? truncated(record.error) : undefined,
      message:
        typeof record.message === 'string'
          ? truncated(record.message)
          : undefined,
    };
  }
  return {
    status,
    message: rawText.length > 0 ? truncated(rawText) : undefined,
  };
}

function retryAfterMilliseconds(
  response: Response,
  now: () => number,
): number | null {
  const value = response.headers.get('Retry-After')?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - now()) : null;
}

function mapHttpError(
  response: Response,
  diagnostic: MalRequestDiagnostic,
  now: () => number,
): Error {
  const retryAfterMs = retryAfterMilliseconds(response, now);
  if (response.status === 401 || response.status === 403) {
    return new MalUnauthorizedError(response.status, undefined, diagnostic);
  }
  if (response.status === 404) {
    return new MalNotFoundError(undefined, diagnostic);
  }
  if (response.status === 429) {
    return new MalRateLimitError(retryAfterMs, undefined, diagnostic);
  }
  if ([500, 502, 503, 504].includes(response.status)) {
    return new MalServiceUnavailableError(
      response.status,
      retryAfterMs,
      undefined,
      diagnostic,
    );
  }
  return new MalHttpError(response.status, undefined, diagnostic);
}

function errorDiagnostic(error: unknown): MalRequestDiagnostic {
  return error instanceof MalHttpError ||
    error instanceof MalNetworkError ||
    error instanceof MalNotFoundError ||
    error instanceof MalRateLimitError ||
    error instanceof MalResponseFormatError ||
    error instanceof MalServiceUnavailableError ||
    error instanceof MalTimeoutError ||
    error instanceof MalUnauthorizedError
    ? error.diagnostic
    : {};
}

function errorKind(error: unknown): string {
  if (error instanceof MalTimeoutError) return 'timeout';
  if (error instanceof MalNetworkError) return 'network';
  if (error instanceof MalRateLimitError) return 'rate_limit';
  if (error instanceof MalServiceUnavailableError) return 'service_unavailable';
  if (error instanceof MalUnauthorizedError) return 'unauthorized';
  if (error instanceof MalResponseFormatError) return 'invalid_response';
  if (error instanceof MalHttpError || error instanceof MalNotFoundError) {
    return 'http';
  }
  return 'unknown';
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof MalRateLimitError ||
    error instanceof MalServiceUnavailableError ||
    error instanceof MalNetworkError ||
    error instanceof MalTimeoutError
  );
}

function retryDelay(error: unknown, random: () => number): number {
  if (
    (error instanceof MalRateLimitError ||
      error instanceof MalServiceUnavailableError) &&
    error.retryAfterMs !== null
  ) {
    return Math.min(MAX_RETRY_DELAY_MS, error.retryAfterMs);
  }
  const jitter = Math.min(1, Math.max(0, random()));
  if (error instanceof MalRateLimitError) return 1_500 + jitter * 1_000;
  if (error instanceof MalServiceUnavailableError)
    return 1_000 + jitter * 1_000;
  return 500 + jitter * 500;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export function buildMalUrl(
  baseUrl: string,
  path: string,
  params?: MalQueryParameters,
): string {
  const normalizedBase = normalizeMalBaseUrl(baseUrl);
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
  const url = `${normalizedBase}/${normalizedPath}`;
  return query.length > 0 ? `${url}?${query}` : url;
}

export function createNativeMalTransport(
  options: MalClientOptions = {},
): NativeMalTransport {
  const clientId = (options.clientId ?? MAL_CLIENT_ID).trim();
  const configuredBaseUrl = normalizeMalBaseUrl(
    options.baseUrl ?? MAL_BASE_URL,
  );
  const baseUrl = configuredBaseUrl || MAL_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const maximumAttempts = Math.min(
    DEFAULT_MAXIMUM_ATTEMPTS,
    Math.max(
      1,
      Math.floor(options.maximumAttempts ?? DEFAULT_MAXIMUM_ATTEMPTS),
    ),
  );

  return {
    async get(operation, path, params) {
      if (!isMalClientIdConfigured(clientId)) {
        throw new MalConfigurationError();
      }
      const url = buildMalUrl(baseUrl, path, params);
      for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const controller = new AbortController();
        const startedAt = now();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-MAL-CLIENT-ID': clientId,
            },
            signal: controller.signal,
          });
          const rawText = await response.text();
          const body = parseBody(rawText);
          const elapsedMs = Math.max(0, now() - startedAt);
          const diagnostic: MalRequestDiagnostic = {
            status: response.status,
            url,
            elapsedMs,
            response: responseDiagnostic(response.status, body, rawText),
          };
          if (!response.ok) throw mapHttpError(response, diagnostic, now);
          if (!body.parsed) {
            throw new MalResponseFormatError(
              rawText.length === 0
                ? 'MyAnimeList returned an empty successful response.'
                : 'MyAnimeList returned malformed JSON.',
              diagnostic,
            );
          }
          if (process.env.NODE_ENV === 'development') {
            console.info('[MAL] request succeeded', {
              provider: 'mal',
              operation,
              method: 'GET',
              url,
              status: response.status,
              elapsedMs,
              attempt,
              maximumAttempts,
              platform: Platform.OS,
            });
          }
          return {
            data: body.value,
            status: response.status,
            elapsedMs,
            url,
          };
        } catch (error: unknown) {
          let mapped: unknown = error;
          if (!isMappedMalError(error)) {
            const diagnostic: MalRequestDiagnostic = {
              url,
              elapsedMs: Math.max(0, now() - startedAt),
            };
            if (
              controller.signal.aborted ||
              hasErrorName(error, 'AbortError')
            ) {
              mapped = new MalTimeoutError(undefined, diagnostic);
            } else if (error instanceof TypeError) {
              mapped = new MalNetworkError(error.message, diagnostic);
            }
          }
          if (process.env.NODE_ENV === 'development') {
            const diagnostic = errorDiagnostic(mapped);
            console.warn('[MAL] request attempt failed', {
              provider: 'mal',
              operation,
              method: 'GET',
              url,
              status: diagnostic.status,
              elapsedMs: diagnostic.elapsedMs,
              attempt,
              maximumAttempts,
              errorKind: errorKind(mapped),
              platform: Platform.OS,
            });
          }
          if (!isRetryable(mapped) || attempt >= maximumAttempts) throw mapped;
          await sleep(retryDelay(mapped, random));
        } finally {
          clearTimeout(timeout);
        }
      }
      throw new Error('MyAnimeList request attempts were exhausted.');
    },
  };
}

export function createMalClient(options: MalClientOptions = {}): MalClientPort {
  const transport = createNativeMalTransport(options);
  const getData = async (
    operation: string,
    path: string,
    params?: MalQueryParameters,
  ): Promise<unknown> => (await transport.get(operation, path, params)).data;
  return {
    anime: {
      search: (params) => getData('search', '/anime', params),
      getDetails: (id, fields) =>
        getData('details', `/anime/${encodeURIComponent(String(id))}`, {
          fields,
        }),
      getRanking: (params) => getData('ranking', '/anime/ranking', params),
      getSeason: (year, season, params) =>
        getData(
          'seasonal',
          `/anime/season/${encodeURIComponent(String(year))}/${season}`,
          params,
        ),
    },
  };
}
