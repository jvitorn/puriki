export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export class RepositoryError extends Error {
  constructor(message = 'The repository could not complete this request.') {
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
  | 'configuration'
  | 'unauthorized'
  | 'session_expired'
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
  network:
    'Unable to reach the anime catalog. Check your connection and try again.',
  timeout: 'The anime catalog took too long to respond. Please try again.',
  rate_limit:
    'The anime catalog is receiving too many requests. Please wait a moment and try again.',
  unavailable: 'The anime catalog is temporarily unavailable.',
  not_found: 'Anime not found.',
  configuration: 'The MyAnimeList fallback is not configured.',
  unauthorized: 'MyAnimeList rejected the application Client ID.',
  session_expired: 'The AniList session is no longer valid.',
  http: 'The anime catalog could not complete the request. Please try again.',
  invalid_response:
    'The anime catalog returned an unknown response format. Please try again.',
};

export function getUserSafeErrorMessage(error: unknown): string {
  return error instanceof DataSourceError
    ? SAFE_ERROR_MESSAGES[error.code]
    : 'Something went wrong. Please try again.';
}
