import { DataSourceError } from '@/domain/errors/domain-error';

export class JikanNetworkError extends DataSourceError {
  constructor(message = 'The Jikan network request failed.') {
    super('network', message);
    this.name = 'JikanNetworkError';
  }
}

export class JikanTimeoutError extends DataSourceError {
  constructor(message = 'The Jikan request timed out.') {
    super('timeout', message);
    this.name = 'JikanTimeoutError';
  }
}

export class JikanRateLimitError extends DataSourceError {
  constructor(
    readonly retryAfterMs: number | null,
    message = 'Jikan rate limit exceeded.',
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
  ) {
    super('unavailable', message);
    this.name = 'JikanServiceUnavailableError';
  }
}

export class JikanNotFoundError extends DataSourceError {
  constructor(message = 'The requested anime was not found by Jikan.') {
    super('not_found', message);
    this.name = 'JikanNotFoundError';
  }
}

export class JikanResponseFormatError extends DataSourceError {
  constructor(message = 'Jikan returned an unsupported response format.') {
    super('invalid_response', message);
    this.name = 'JikanResponseFormatError';
  }
}

export class JikanHttpError extends DataSourceError {
  constructor(
    readonly status: number,
    message = `Jikan request failed with HTTP ${status}.`,
  ) {
    super('invalid_response', message);
    this.name = 'JikanHttpError';
  }
}
