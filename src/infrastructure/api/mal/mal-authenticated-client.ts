import { buildMalUrl } from '@/infrastructure/api/mal/mal-client';
import {
  MAL_BASE_URL,
  normalizeMalBaseUrl,
} from '@/infrastructure/api/mal/mal-config';
import {
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
const DEFAULT_GET_MAXIMUM_ATTEMPTS = 2;
const MAX_RETRY_DELAY_MS = 5_000;

export type MalQueryParameters = Record<
  string,
  string | number | boolean | null | undefined
>;

export interface MalAuthenticatedResponse {
  data: unknown;
  status: number;
}

export interface MalAuthenticatedClientPort {
  get(
    path: string,
    params?: MalQueryParameters,
  ): Promise<MalAuthenticatedResponse>;
  patch(
    path: string,
    formBody: Record<string, string | number>,
  ): Promise<MalAuthenticatedResponse>;
  delete(path: string): Promise<MalAuthenticatedResponse>;
}

export interface MalAuthenticatedClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  accessTokenProvider: () => Promise<string>;
}

interface ParsedBody {
  parsed: boolean;
  value: unknown;
}

function isMappedMalError(error: unknown): boolean {
  return (
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

function hasErrorName(error: unknown, name: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === name
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
      error: typeof record.error === 'string' ? record.error : undefined,
      message: typeof record.message === 'string' ? record.message : undefined,
    };
  }
  return {
    status,
    message: rawText.length > 0 ? rawText.slice(0, 500) : undefined,
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

export class MalAuthenticatedClient implements MalAuthenticatedClientPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;
  private readonly accessTokenProvider: () => Promise<string>;

  constructor(options: MalAuthenticatedClientOptions) {
    this.baseUrl = normalizeMalBaseUrl(options.baseUrl ?? MAL_BASE_URL);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
    this.accessTokenProvider = options.accessTokenProvider;
  }

  get(
    path: string,
    params?: MalQueryParameters,
  ): Promise<MalAuthenticatedResponse> {
    const url = buildMalUrl(this.baseUrl, path, params);
    return this.request('GET', url, undefined, DEFAULT_GET_MAXIMUM_ATTEMPTS);
  }

  patch(
    path: string,
    formBody: Record<string, string | number>,
  ): Promise<MalAuthenticatedResponse> {
    const url = buildMalUrl(this.baseUrl, path);
    const body = new URLSearchParams(
      Object.fromEntries(
        Object.entries(formBody).map(([key, value]) => [key, String(value)]),
      ),
    ).toString();
    return this.request('PATCH', url, body, 1);
  }

  delete(path: string): Promise<MalAuthenticatedResponse> {
    const url = buildMalUrl(this.baseUrl, path);
    return this.request('DELETE', url, undefined, 1);
  }

  private async request(
    method: 'GET' | 'PATCH' | 'DELETE',
    url: string,
    body: string | undefined,
    maximumAttempts: number,
  ): Promise<MalAuthenticatedResponse> {
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const accessToken = await this.accessTokenProvider();
        const headers: Record<string, string> = {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        };
        if (body !== undefined) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
        const response = await this.fetchImpl(url, {
          method,
          headers,
          body,
          signal: controller.signal,
        });
        const rawText = await response.text();
        const parsedBody = parseBody(rawText);
        const diagnostic: MalRequestDiagnostic = {
          status: response.status,
          url,
          response: responseDiagnostic(response.status, parsedBody, rawText),
        };
        if (!response.ok) throw mapHttpError(response, diagnostic, this.now);
        return {
          data: parsedBody.parsed ? parsedBody.value : null,
          status: response.status,
        };
      } catch (error: unknown) {
        let mapped: unknown = error;
        if (!isMappedMalError(error)) {
          const diagnostic: MalRequestDiagnostic = { url };
          if (controller.signal.aborted || hasErrorName(error, 'AbortError')) {
            mapped = new MalTimeoutError(undefined, diagnostic);
          } else if (error instanceof TypeError) {
            mapped = new MalNetworkError(error.message, diagnostic);
          }
        }
        if (!isRetryable(mapped) || attempt >= maximumAttempts) throw mapped;
        await this.sleep(retryDelay(mapped, this.random));
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error('MyAnimeList request attempts were exhausted.');
  }
}
