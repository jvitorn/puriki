import {
  AniListGraphQLValidationError,
  AniListHttpError,
  AniListNetworkError,
  AniListNotFoundError,
  AniListRateLimitError,
  AniListResponseFormatError,
  AniListServiceUnavailableError,
  AniListTimeoutError,
  AniListUnauthorizedError,
  AniListDiagnosticError,
  type AniListRequestDiagnostic,
  type AniListRateLimitMetrics,
} from '@/infrastructure/api/anilist/anilist-errors';
import { AniListRequestCoordinator } from '@/infrastructure/api/anilist/anilist-request-coordinator';
import { PrimaryProviderError } from '@/infrastructure/repositories/resilient/primary-provider-error';

export const ANILIST_GRAPHQL_ENDPOINT = 'https://graphql.anilist.co';
export const ANILIST_DIAGNOSTIC_TIMEOUT_MS = 12_000;

export interface AniListGraphQLResponse {
  data: unknown;
  graphqlErrors: string[];
  status: number;
  elapsedMs: number;
  responseBytes: number;
  rateLimit: AniListRateLimitMetrics;
}

export interface AniListClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  logger?: (message: string) => void;
  coordinator?: AniListRequestCoordinator;
}

export interface AniListExecuteRequest {
  testName: string;
  query: string;
  variables?: Record<string, unknown>;
}

interface HeadersLike {
  get(name: string): string | null;
}

function numericHeader(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function retryAfterSeconds(value: string | null, nowMs: number): number | null {
  const seconds = numericHeader(value);
  if (seconds !== null) return Math.ceil(seconds);
  if (!value) return null;
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - nowMs) / 1_000))
    : null;
}

export function parseAniListRateLimitHeaders(
  headers: HeadersLike,
  nowMs = Date.now(),
): AniListRateLimitMetrics {
  return {
    limit: numericHeader(headers.get('X-RateLimit-Limit')),
    remaining: numericHeader(headers.get('X-RateLimit-Remaining')),
    retryAfterSeconds: retryAfterSeconds(headers.get('Retry-After'), nowMs),
    resetAt: numericHeader(headers.get('X-RateLimit-Reset')),
  };
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function graphQLErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((error) => {
    if (isRecord(error) && typeof error.message === 'string') {
      return error.message;
    }
    return 'AniList returned an unknown GraphQL error.';
  });
}

function emptyRateLimit(): AniListRateLimitMetrics {
  return {
    limit: null,
    remaining: null,
    retryAfterSeconds: null,
    resetAt: null,
  };
}

export class AniListDiagnosticClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly logger: ((message: string) => void) | null;
  private readonly coordinator: AniListRequestCoordinator;

  constructor(options: AniListClientOptions = {}) {
    this.endpoint = options.endpoint ?? ANILIST_GRAPHQL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? ANILIST_DIAGNOSTIC_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimeoutImpl ?? setTimeout;
    this.clearTimer = options.clearTimeoutImpl ?? clearTimeout;
    this.logger =
      options.logger ??
      (process.env.NODE_ENV === 'development'
        ? (message) => console.info(message)
        : null);
    this.coordinator = options.coordinator ?? new AniListRequestCoordinator();
  }

  async execute({
    testName,
    query,
    variables = {},
  }: AniListExecuteRequest): Promise<AniListGraphQLResponse> {
    const startedAt = this.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.coordinator.schedule(
        `diagnostic:${testName}`,
        () =>
          this.fetchImpl(this.endpoint, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, variables }),
            signal: controller.signal,
          }),
      );
      const body = await response.text();
      const elapsedMs = Math.max(0, this.now() - startedAt);
      const responseBytes = utf8ByteLength(body);
      const rateLimit = parseAniListRateLimitHeaders(
        response.headers,
        this.now(),
      );
      this.coordinator.observeRateLimit(rateLimit);
      this.log(testName, response.status, elapsedMs, responseBytes, rateLimit);
      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        const kind =
          response.status === 429
            ? 'rate_limit'
            : response.status < 200 || response.status >= 300
              ? 'http'
              : 'format';
        throw new AniListDiagnosticError(
          kind,
          response.status === 429
            ? 'AniList rate-limited the diagnostic request.'
            : response.status < 200 || response.status >= 300
              ? `AniList returned HTTP ${response.status} with invalid JSON.`
              : 'AniList returned invalid JSON.',
          {
            status: response.status,
            elapsedMs,
            responseBytes,
            rateLimit,
            graphqlErrors: [],
          },
        );
      }
      const errors = isRecord(payload) ? graphQLErrors(payload.errors) : [];
      if (response.status === 429) {
        this.coordinator.block(
          retryAfterMs(rateLimit, this.now()),
          rateLimit.resetAt,
        );
        throw new AniListDiagnosticError(
          'rate_limit',
          errors[0] ?? 'AniList rate-limited the diagnostic request.',
          {
            status: response.status,
            elapsedMs,
            responseBytes,
            rateLimit,
            graphqlErrors: errors,
          },
        );
      }
      if (response.status < 200 || response.status >= 300) {
        throw new AniListDiagnosticError(
          'http',
          errors[0] ?? `AniList returned HTTP ${response.status}.`,
          {
            status: response.status,
            elapsedMs,
            responseBytes,
            rateLimit,
            graphqlErrors: errors,
          },
        );
      }
      if (!isRecord(payload)) {
        throw new AniListDiagnosticError(
          'format',
          'AniList returned an invalid GraphQL envelope.',
          {
            status: response.status,
            elapsedMs,
            responseBytes,
            rateLimit,
            graphqlErrors: [],
          },
        );
      }
      return {
        data: payload.data,
        graphqlErrors: errors,
        status: response.status,
        elapsedMs,
        responseBytes,
        rateLimit,
      };
    } catch (error: unknown) {
      if (error instanceof AniListDiagnosticError) throw error;
      const elapsedMs = Math.max(0, this.now() - startedAt);
      if (error instanceof AniListRateLimitError) {
        const snapshot = this.coordinator.getSnapshot();
        throw new AniListDiagnosticError('rate_limit', error.message, {
          status: error.diagnostic?.status ?? 429,
          elapsedMs,
          responseBytes: 0,
          rateLimit: snapshot,
          graphqlErrors: error.diagnostic?.graphqlErrors ?? [],
        });
      }
      const kind = timedOut ? 'timeout' : 'network';
      const message = timedOut
        ? 'AniList took too long to respond.'
        : 'Unable to reach AniList.';
      this.log(testName, null, elapsedMs, 0, emptyRateLimit());
      throw new AniListDiagnosticError(kind, message, {
        status: null,
        elapsedMs,
        responseBytes: 0,
        rateLimit: emptyRateLimit(),
        graphqlErrors: [],
      });
    } finally {
      this.clearTimer(timeout);
    }
  }

  private log(
    testName: string,
    status: number | null,
    elapsedMs: number,
    responseBytes: number,
    rateLimit: AniListRateLimitMetrics,
  ): void {
    this.logger?.(
      `[AniListDiagnostic] ${testName} status=${status ?? 'none'} elapsed=${elapsedMs}ms bytes=${responseBytes} remaining=${rateLimit.remaining ?? 'unknown'}`,
    );
  }
}

export interface AniListGraphQLError {
  message: string;
  path: readonly (string | number)[];
  status?: number | null;
}

export interface AniListClientResponse {
  data: unknown;
  errors: AniListGraphQLError[];
  status: number;
  elapsedMs: number;
  rateLimit: AniListRateLimitMetrics;
}

export interface AniListClientPort {
  execute(request: {
    key: string;
    query: string;
    variables?: Record<string, unknown>;
  }): Promise<AniListClientResponse>;
}

export interface AniListProductionClientOptions {
  endpoint?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  coordinator?: AniListRequestCoordinator;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  accessTokenProvider?: () => Promise<string>;
}

export interface AniListRequestPolicyOptions {
  maximumAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function detailedGraphQLErrors(value: unknown): AniListGraphQLError[] {
  if (!Array.isArray(value)) return [];
  return value.map((error) => {
    if (!isRecord(error)) {
      return {
        message: 'AniList returned an unknown GraphQL error.',
        path: [],
        status: null,
      };
    }
    return {
      message:
        typeof error.message === 'string'
          ? error.message
          : 'AniList returned an unknown GraphQL error.',
      path: Array.isArray(error.path)
        ? error.path.filter(
            (part): part is string | number =>
              typeof part === 'string' || typeof part === 'number',
          )
        : [],
      status:
        typeof error.status === 'number' && Number.isFinite(error.status)
          ? error.status
          : null,
    };
  });
}

function isTemporaryApiDisable(
  errors: readonly AniListGraphQLError[],
): boolean {
  return errors.some((error) =>
    /temporar(?:y|ily)|maintenance|api.{0,20}disabled|service.{0,20}unavailable/i.test(
      error.message,
    ),
  );
}

function isUnauthorizedResponse(
  status: number,
  errors: readonly AniListGraphQLError[],
): boolean {
  return (
    status === 401 ||
    status === 403 ||
    errors.some(
      (error) =>
        error.status === 401 ||
        error.status === 403 ||
        /unauthenticated|invalid.{0,12}token|token.{0,12}(expired|invalid)/i.test(
          error.message,
        ),
    )
  );
}

function retryAfterMs(
  rateLimit: AniListRateLimitMetrics,
  nowMs: number,
): number | null {
  const retry =
    rateLimit.retryAfterSeconds === null
      ? 0
      : rateLimit.retryAfterSeconds * 1_000;
  const resetAtMs =
    rateLimit.resetAt === null
      ? 0
      : rateLimit.resetAt < 1_000_000_000_000
        ? rateLimit.resetAt * 1_000
        : rateLimit.resetAt;
  const reset = Math.max(0, resetAtMs - nowMs);
  const duration = Math.max(retry, reset);
  return duration > 0 ? duration : null;
}

export class AniListClient implements AniListClientPort {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly coordinator: AniListRequestCoordinator;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private readonly accessTokenProvider?: () => Promise<string>;

  constructor(options: AniListProductionClientOptions = {}) {
    this.endpoint = options.endpoint ?? ANILIST_GRAPHQL_ENDPOINT;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? ANILIST_DIAGNOSTIC_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
    this.coordinator = options.coordinator ?? new AniListRequestCoordinator();
    this.setTimer = options.setTimeoutImpl ?? setTimeout;
    this.clearTimer = options.clearTimeoutImpl ?? clearTimeout;
    this.accessTokenProvider = options.accessTokenProvider;
  }

  execute({
    key,
    query,
    variables = {},
  }: {
    key: string;
    query: string;
    variables?: Record<string, unknown>;
  }): Promise<AniListClientResponse> {
    return this.coordinator.schedule(key, () =>
      this.executeAttempt(query, variables),
    );
  }

  private async executeAttempt(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<AniListClientResponse> {
    const startedAt = this.now();
    const controller = new AbortController();
    let timedOut = false;
    const timeout = this.setTimer(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const accessToken = this.accessTokenProvider
        ? await this.accessTokenProvider()
        : null;
      if (this.accessTokenProvider && !accessToken?.trim()) {
        throw new AniListUnauthorizedError();
      }
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      const body = await response.text();
      const elapsedMs = Math.max(0, this.now() - startedAt);
      const rateLimit = parseAniListRateLimitHeaders(
        response.headers,
        this.now(),
      );
      this.coordinator.observeRateLimit(rateLimit);
      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        const diagnostic = this.diagnostic(
          response.status,
          elapsedMs,
          rateLimit,
          [],
        );
        if (
          this.accessTokenProvider &&
          (response.status === 401 || response.status === 403)
        ) {
          throw new AniListUnauthorizedError();
        }
        if (response.status === 429) {
          throw new AniListRateLimitError(
            retryAfterMs(rateLimit, this.now()),
            undefined,
            diagnostic,
          );
        }
        if (response.status >= 500) {
          throw new AniListServiceUnavailableError(
            response.status,
            undefined,
            diagnostic,
          );
        }
        if (response.status === 400) {
          throw new AniListGraphQLValidationError(undefined, diagnostic);
        }
        if (response.status === 404) {
          throw new AniListNotFoundError(undefined, diagnostic);
        }
        if (response.status < 200 || response.status >= 300) {
          throw new AniListHttpError(response.status, undefined, diagnostic);
        }
        throw new AniListResponseFormatError(
          'AniList returned malformed JSON.',
          diagnostic,
        );
      }
      if (!isRecord(payload)) {
        const diagnostic = this.diagnostic(
          response.status,
          elapsedMs,
          rateLimit,
          [],
        );
        if (
          this.accessTokenProvider &&
          (response.status === 401 || response.status === 403)
        ) {
          throw new AniListUnauthorizedError();
        }
        if (response.status === 429) {
          throw new AniListRateLimitError(
            retryAfterMs(rateLimit, this.now()),
            undefined,
            diagnostic,
          );
        }
        if (response.status >= 500) {
          throw new AniListServiceUnavailableError(
            response.status,
            undefined,
            diagnostic,
          );
        }
        if (response.status === 400) {
          throw new AniListGraphQLValidationError(undefined, diagnostic);
        }
        if (response.status === 404) {
          throw new AniListNotFoundError(undefined, diagnostic);
        }
        if (response.status < 200 || response.status >= 300) {
          throw new AniListHttpError(response.status, undefined, diagnostic);
        }
        throw new AniListResponseFormatError(
          'AniList returned an invalid GraphQL envelope.',
          diagnostic,
        );
      }
      const errors = detailedGraphQLErrors(payload.errors);
      const diagnostic = this.diagnostic(
        response.status,
        elapsedMs,
        rateLimit,
        errors.map(({ message }) => message),
      );
      if (response.status === 429) {
        const duration = retryAfterMs(rateLimit, this.now());
        this.coordinator.block(duration, rateLimit.resetAt);
        throw new AniListRateLimitError(
          duration,
          errors[0]?.message,
          diagnostic,
        );
      }
      if (response.status === 403 && isTemporaryApiDisable(errors)) {
        throw new AniListServiceUnavailableError(
          403,
          errors[0]?.message,
          diagnostic,
        );
      }
      if (
        this.accessTokenProvider &&
        isUnauthorizedResponse(response.status, errors)
      ) {
        throw new AniListUnauthorizedError(errors[0]?.message);
      }
      if (response.status === 400) {
        throw new AniListGraphQLValidationError(errors[0]?.message, diagnostic);
      }
      if (response.status === 404) {
        throw new AniListNotFoundError(errors[0]?.message, diagnostic);
      }
      if (response.status >= 500) {
        throw new AniListServiceUnavailableError(
          response.status,
          errors[0]?.message,
          diagnostic,
        );
      }
      if (response.status < 200 || response.status >= 300) {
        throw new AniListHttpError(
          response.status,
          errors[0]?.message,
          diagnostic,
        );
      }
      return {
        data: payload.data,
        errors,
        status: response.status,
        elapsedMs,
        rateLimit,
      };
    } catch (error: unknown) {
      if (
        error instanceof PrimaryProviderError ||
        error instanceof AniListUnauthorizedError
      ) {
        throw error;
      }
      const diagnostic = this.diagnostic(
        null,
        Math.max(0, this.now() - startedAt),
        emptyRateLimit(),
        [],
      );
      if (timedOut) throw new AniListTimeoutError(undefined, diagnostic);
      throw new AniListNetworkError(
        error instanceof Error ? error.message : undefined,
        diagnostic,
      );
    } finally {
      this.clearTimer(timeout);
    }
  }

  private diagnostic(
    status: number | null,
    elapsedMs: number,
    rateLimit: AniListRateLimitMetrics,
    errors: string[],
  ): AniListRequestDiagnostic {
    return { status, elapsedMs, rateLimit, graphqlErrors: errors };
  }
}

export function createAniListClient(
  options: AniListProductionClientOptions = {},
): AniListClientPort {
  return new AniListClient(options);
}

export async function executeAniListRequest(
  client: AniListClientPort,
  request: {
    key: string;
    query: string;
    variables?: Record<string, unknown>;
  },
  options: AniListRequestPolicyOptions = {},
): Promise<AniListClientResponse> {
  const maximumAttempts = Math.max(1, options.maximumAttempts ?? 2);
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      return await client.execute({
        ...request,
        key: `${request.key}:attempt:${attempt}`,
      });
    } catch (error: unknown) {
      lastError = error;
      const retryable =
        error instanceof AniListNetworkError ||
        error instanceof AniListTimeoutError ||
        (error instanceof AniListServiceUnavailableError &&
          error.status >= 500);
      if (!retryable || attempt >= maximumAttempts) throw error;
      await sleep(250 * attempt);
    }
  }
  throw lastError;
}
