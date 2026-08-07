import { DataSourceError } from '@/domain/errors/domain-error';

export interface MalResponseDiagnostic {
  status?: number;
  error?: string;
  message?: string;
}

export interface MalRequestDiagnostic {
  status?: number;
  url?: string;
  elapsedMs?: number;
  response?: MalResponseDiagnostic;
}

export class MalConfigurationError extends DataSourceError {
  constructor(message = 'MyAnimeList Client ID is not configured.') {
    super('configuration', message);
    this.name = 'MalConfigurationError';
  }
}

export class MalUnauthorizedError extends DataSourceError {
  constructor(
    readonly status: 401 | 403,
    message = 'MyAnimeList rejected the application Client ID.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('unauthorized', message);
    this.name = 'MalUnauthorizedError';
  }
}

export class MalRateLimitError extends DataSourceError {
  constructor(
    readonly retryAfterMs: number | null,
    message = 'MyAnimeList rate limit exceeded.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('rate_limit', message);
    this.name = 'MalRateLimitError';
  }
}

export class MalNotFoundError extends DataSourceError {
  constructor(
    message = 'The requested anime was not found by MyAnimeList.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('not_found', message);
    this.name = 'MalNotFoundError';
  }
}

export class MalServiceUnavailableError extends DataSourceError {
  constructor(
    readonly status: number,
    readonly retryAfterMs: number | null,
    message = `MyAnimeList is unavailable (HTTP ${status}).`,
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('unavailable', message);
    this.name = 'MalServiceUnavailableError';
  }
}

export class MalNetworkError extends DataSourceError {
  constructor(
    message = 'The MyAnimeList network request failed.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('network', message);
    this.name = 'MalNetworkError';
  }
}

export class MalTimeoutError extends DataSourceError {
  constructor(
    message = 'The MyAnimeList request timed out.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('timeout', message);
    this.name = 'MalTimeoutError';
  }
}

export class MalResponseFormatError extends DataSourceError {
  constructor(
    message = 'MyAnimeList returned an unsupported response format.',
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('invalid_response', message);
    this.name = 'MalResponseFormatError';
  }
}

export class MalHttpError extends DataSourceError {
  constructor(
    readonly status: number,
    message = `MyAnimeList request failed with HTTP ${status}.`,
    readonly diagnostic: MalRequestDiagnostic = {},
  ) {
    super('http', message);
    this.name = 'MalHttpError';
  }
}
