export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class RepositoryError extends Error {
  constructor(
    message = 'The mock repository could not complete this request.',
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export type DataSourceErrorCode =
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'unavailable'
  | 'not_found'
  | 'http'
  | 'invalid_response';

export class DataSourceError extends Error {
  constructor(
    readonly code: DataSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DataSourceError';
  }
}

const SAFE_ERROR_MESSAGES: Record<DataSourceErrorCode, string> = {
  network: 'Unable to reach Jikan. Check your connection and try again.',
  timeout: 'Jikan took too long to respond. Please try again.',
  rate_limit:
    'Jikan is receiving too many requests. Please wait a moment and try again.',
  unavailable: 'Jikan is temporarily unavailable. Please try again shortly.',
  not_found: 'Anime not found.',
  http: 'Jikan could not complete the request. Please try again.',
  invalid_response:
    'Jikan returned an unknown response format. Please try again.',
};

export function getUserSafeErrorMessage(error: unknown): string {
  return error instanceof DataSourceError
    ? SAFE_ERROR_MESSAGES[error.code]
    : 'Something went wrong. Please try again.';
}
