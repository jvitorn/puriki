import { PrimaryProviderError } from '@/infrastructure/repositories/resilient/primary-provider-error';

export type AniListDiagnosticErrorKind =
  | 'none'
  | 'timeout'
  | 'network'
  | 'graphql'
  | 'http'
  | 'rate_limit'
  | 'format'
  | 'unknown';

export interface AniListRateLimitMetrics {
  limit: number | null;
  remaining: number | null;
  retryAfterSeconds: number | null;
  resetAt: number | null;
}

export interface AniListErrorMetrics {
  status: number | null;
  elapsedMs: number;
  responseBytes: number;
  rateLimit: AniListRateLimitMetrics;
  graphqlErrors: string[];
}

export class AniListDiagnosticError extends Error {
  constructor(
    readonly kind: Exclude<AniListDiagnosticErrorKind, 'none' | 'graphql'>,
    message: string,
    readonly metrics: AniListErrorMetrics,
  ) {
    super(message);
    this.name = 'AniListDiagnosticError';
  }
}

export interface AniListRequestDiagnostic {
  status: number | null;
  elapsedMs: number;
  rateLimit: AniListRateLimitMetrics;
  graphqlErrors: string[];
}

export class AniListNetworkError extends PrimaryProviderError {
  constructor(
    message = 'The AniList network request failed.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('network', message, {
      fallbackEligible: true,
      circuitFailure: true,
    });
    this.name = 'AniListNetworkError';
  }
}

export class AniListTimeoutError extends PrimaryProviderError {
  constructor(
    message = 'The AniList request timed out.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('timeout', message, {
      fallbackEligible: true,
      circuitFailure: true,
    });
    this.name = 'AniListTimeoutError';
  }
}

export class AniListRateLimitError extends PrimaryProviderError {
  constructor(
    retryAfterMs: number | null,
    message = 'AniList rate limit exceeded.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('rate_limit', message, {
      fallbackEligible: true,
      circuitFailure: false,
      retryAfterMs,
    });
    this.name = 'AniListRateLimitError';
  }
}

export class AniListServiceUnavailableError extends PrimaryProviderError {
  constructor(
    readonly status: number,
    message = `AniList is unavailable (HTTP ${status}).`,
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('service_unavailable', message, {
      fallbackEligible: true,
      circuitFailure: true,
    });
    this.name = 'AniListServiceUnavailableError';
  }
}

export class AniListResponseFormatError extends PrimaryProviderError {
  constructor(
    message = 'AniList returned an unsupported response format.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('invalid_response', message, {
      fallbackEligible: true,
      circuitFailure: true,
    });
    this.name = 'AniListResponseFormatError';
  }
}

export class AniListNotFoundError extends PrimaryProviderError {
  constructor(
    message = 'The requested anime was not found by AniList.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('not_found', message, {
      fallbackEligible: true,
      circuitFailure: false,
    });
    this.name = 'AniListNotFoundError';
  }
}

export class AniListGraphQLValidationError extends PrimaryProviderError {
  constructor(
    message = 'AniList rejected an invalid GraphQL operation.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('programming', message);
    this.name = 'AniListGraphQLValidationError';
  }
}

export class AniListGraphQLExecutionError extends PrimaryProviderError {
  constructor(
    message = 'AniList could not resolve the requested catalog data.',
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('invalid_response', message, {
      fallbackEligible: true,
      circuitFailure: true,
    });
    this.name = 'AniListGraphQLExecutionError';
  }
}

export class AniListHttpError extends PrimaryProviderError {
  constructor(
    readonly status: number,
    message = `AniList request failed with HTTP ${status}.`,
    readonly diagnostic?: AniListRequestDiagnostic,
  ) {
    super('programming', message);
    this.name = 'AniListHttpError';
  }
}
