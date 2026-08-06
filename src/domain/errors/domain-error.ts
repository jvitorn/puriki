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
  network: 'No internet connection. Check your connection and try again.',
  timeout: 'The request timed out. Please try again.',
  rate_limit:
    'Jikan is receiving too many requests. Please wait and try again.',
  unavailable:
    'The Jikan service is temporarily unavailable. Please try again later.',
  not_found: 'Anime not found.',
  invalid_response:
    'Jikan returned an unknown response format. Please try again.',
};

export function getUserSafeErrorMessage(error: unknown): string {
  return error instanceof DataSourceError
    ? SAFE_ERROR_MESSAGES[error.code]
    : 'Something went wrong. Please try again.';
}
