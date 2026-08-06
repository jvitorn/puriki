import { DataSourceError } from '@/domain/errors/domain-error';

export interface JikanResponseDiagnostic {
  status?: number;
  type?: string;
  message?: string;
  error?: unknown;
}

export interface JikanRequestDiagnostic {
  status?: number;
  url?: string;
  elapsedMs?: number;
  cacheStatus?: string | null;
  response?: JikanResponseDiagnostic;
}

export class JikanNetworkError extends DataSourceError {
  constructor(
    message = 'The Jikan network request failed.',
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('network', message);
    this.name = 'JikanNetworkError';
  }
}

export class JikanTimeoutError extends DataSourceError {
  constructor(
    message = 'The Jikan request timed out.',
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('timeout', message);
    this.name = 'JikanTimeoutError';
  }
}

export class JikanRateLimitError extends DataSourceError {
  constructor(
    readonly retryAfterMs: number | null,
    message = 'Jikan rate limit exceeded.',
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('rate_limit', message);
    this.name = 'JikanRateLimitError';
  }
}

export class JikanServiceUnavailableError extends DataSourceError {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    message = `Jikan is unavailable (HTTP ${status}).`,
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('unavailable', message);
    this.name = 'JikanServiceUnavailableError';
  }
}

export class JikanNotFoundError extends DataSourceError {
  constructor(
    message = 'The requested anime was not found by Jikan.',
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('not_found', message);
    this.name = 'JikanNotFoundError';
  }
}

export class JikanResponseFormatError extends DataSourceError {
  constructor(
    message = 'Jikan returned an unsupported response format.',
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('invalid_response', message);
    this.name = 'JikanResponseFormatError';
  }
}

export class JikanHttpError extends DataSourceError {
  constructor(
    readonly status: number,
    message = `Jikan request failed with HTTP ${status}.`,
    readonly diagnostic: JikanRequestDiagnostic = {},
  ) {
    super('http', message);
    this.name = 'JikanHttpError';
  }
}
