import { DataSourceError } from '@/domain/errors/domain-error';

export type PrimaryFailureKind =
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'service_unavailable'
  | 'invalid_response'
  | 'not_found'
  | 'programming';

export interface PrimaryFailureClassification {
  kind: PrimaryFailureKind;
  fallbackEligible: boolean;
  circuitFailure: boolean;
  retryAfterMs: number | null;
}

const DATA_SOURCE_CODE: Record<
  PrimaryFailureKind,
  ConstructorParameters<typeof DataSourceError>[0]
> = {
  network: 'network',
  timeout: 'timeout',
  rate_limit: 'rate_limit',
  service_unavailable: 'unavailable',
  invalid_response: 'invalid_response',
  not_found: 'not_found',
  programming: 'http',
};

export class PrimaryProviderError extends DataSourceError {
  readonly fallbackEligible: boolean;
  readonly circuitFailure: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    readonly failureKind: PrimaryFailureKind,
    message: string,
    options: {
      fallbackEligible?: boolean;
      circuitFailure?: boolean;
      retryAfterMs?: number | null;
    } = {},
  ) {
    super(DATA_SOURCE_CODE[failureKind], message);
    this.name = 'PrimaryProviderError';
    this.fallbackEligible = options.fallbackEligible ?? false;
    this.circuitFailure = options.circuitFailure ?? false;
    this.retryAfterMs = options.retryAfterMs ?? null;
  }
}

export function classifyPrimaryFailure(
  error: unknown,
): PrimaryFailureClassification | null {
  return error instanceof PrimaryProviderError
    ? {
        kind: error.failureKind,
        fallbackEligible: error.fallbackEligible,
        circuitFailure: error.circuitFailure,
        retryAfterMs: error.retryAfterMs,
      }
    : null;
}
