import { Platform } from 'react-native';

import {
  createNativeJikanTransport,
  type JikanQueryParameters,
  type NativeJikanClientOptions,
  type NativeJikanResponse,
} from '@/infrastructure/api/jikan/jikan-client';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanNotFoundError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';
import { JikanRequestScheduler } from '@/infrastructure/api/jikan/jikan-request-scheduler';
import type { JikanHealth } from '@/infrastructure/repositories/resilient/catalog-operation-family';

export type JikanDiagnosticOperation =
  'details' | 'popular' | 'seasonal' | 'upcoming' | 'search';

export type JikanDiagnosticErrorKind =
  | 'none'
  | 'http'
  | 'network'
  | 'timeout'
  | 'format'
  | 'service_unavailable'
  | 'rate_limit'
  | 'configuration';

export interface JikanEndpointDiagnosticResult {
  operation: JikanDiagnosticOperation;
  ok: boolean;
  status: number | null;
  elapsedMs: number;
  errorKind: JikanDiagnosticErrorKind;
  message: string;
}

export interface JikanServiceDiagnosticResult {
  platform: string;
  health: JikanHealth;
  endpoints: JikanEndpointDiagnosticResult[];
}

export interface JikanDiagnosticOptions extends NativeJikanClientOptions {
  scheduler?: JikanRequestScheduler;
}

interface DiagnosticEndpoint {
  operation: JikanDiagnosticOperation;
  path: string;
  params?: JikanQueryParameters;
  collection: boolean;
}

const DIAGNOSTIC_ENDPOINTS: readonly DiagnosticEndpoint[] = [
  {
    operation: 'details',
    path: '/anime/1/full',
    collection: false,
  },
  {
    operation: 'popular',
    path: '/top/anime',
    params: { limit: 1, sfw: true },
    collection: true,
  },
  {
    operation: 'seasonal',
    path: '/seasons/now',
    params: { limit: 1, sfw: true },
    collection: true,
  },
  {
    operation: 'upcoming',
    path: '/seasons/upcoming',
    params: { limit: 1, sfw: true },
    collection: true,
  },
  {
    operation: 'search',
    path: '/anime',
    params: { limit: 1, q: 'Naruto', sfw: true },
    collection: true,
  },
];

function statusFromError(error: unknown): number | null {
  if (error instanceof JikanRateLimitError) return 429;
  if (error instanceof JikanNotFoundError) return 404;
  if (
    error instanceof JikanHttpError ||
    error instanceof JikanServiceUnavailableError
  ) {
    return error.status;
  }
  if (
    error instanceof JikanNetworkError ||
    error instanceof JikanResponseFormatError ||
    error instanceof JikanTimeoutError
  ) {
    return error.diagnostic.status ?? null;
  }
  return null;
}

function classifyError(error: unknown): JikanDiagnosticErrorKind {
  if (error instanceof JikanTimeoutError) return 'timeout';
  if (error instanceof JikanNetworkError) return 'network';
  if (error instanceof JikanResponseFormatError) return 'format';
  if (error instanceof JikanRateLimitError) return 'rate_limit';
  if (error instanceof JikanServiceUnavailableError) {
    return 'service_unavailable';
  }
  if (error instanceof JikanNotFoundError) return 'configuration';
  return 'http';
}

function diagnosticMessage(error: unknown): string {
  if (error instanceof JikanTimeoutError) {
    return 'Jikan took too long to respond.';
  }
  if (error instanceof JikanNetworkError) {
    return 'The native transport could not reach Jikan.';
  }
  if (error instanceof JikanResponseFormatError) {
    return 'Jikan returned an invalid response format.';
  }
  if (error instanceof JikanRateLimitError) {
    return 'Jikan rate-limited the diagnostic request.';
  }
  if (error instanceof JikanNotFoundError) {
    return 'The stable diagnostic resource was not found.';
  }
  if (error instanceof Error) return error.message;
  return 'The Jikan endpoint diagnostic failed.';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateResponse(
  endpoint: DiagnosticEndpoint,
  response: NativeJikanResponse,
): void {
  if (!isRecord(response.data)) {
    throw new JikanResponseFormatError('Jikan returned an invalid response.', {
      status: response.status,
      url: response.url,
      elapsedMs: response.elapsedMs,
      cacheStatus: response.cacheStatus,
    });
  }
  const data = response.data.data;
  const valid = endpoint.collection ? Array.isArray(data) : isRecord(data);
  if (!valid) {
    throw new JikanResponseFormatError(
      `Jikan returned an invalid ${endpoint.operation} diagnostic response.`,
      {
        status: response.status,
        url: response.url,
        elapsedMs: response.elapsedMs,
        cacheStatus: response.cacheStatus,
      },
    );
  }
}

function healthFromResults(
  endpoints: readonly JikanEndpointDiagnosticResult[],
): JikanHealth {
  if (endpoints.some((endpoint) => endpoint.errorKind === 'rate_limit')) {
    return 'rate_limited';
  }
  if (endpoints.every((endpoint) => endpoint.ok)) return 'healthy';
  if (endpoints.some((endpoint) => endpoint.ok)) return 'degraded';
  return 'unavailable';
}

export async function runJikanConnectivityDiagnostic(
  options: JikanDiagnosticOptions = {},
): Promise<JikanServiceDiagnosticResult> {
  const { scheduler = new JikanRequestScheduler(), ...transportOptions } =
    options;
  const now = options.now ?? Date.now;
  const transport = createNativeJikanTransport(transportOptions);
  const endpoints: JikanEndpointDiagnosticResult[] = [];
  let rateLimited = false;

  for (const endpoint of DIAGNOSTIC_ENDPOINTS) {
    if (rateLimited) {
      endpoints.push({
        operation: endpoint.operation,
        ok: false,
        status: null,
        elapsedMs: 0,
        errorKind: 'rate_limit',
        message: 'Skipped because Jikan is rate limited.',
      });
      continue;
    }
    const startedAt = now();
    try {
      const response = await scheduler.schedule(
        `diagnostic:${endpoint.operation}`,
        () =>
          transport.get(
            `diagnostic:${endpoint.operation}`,
            endpoint.path,
            endpoint.params,
          ),
      );
      validateResponse(endpoint, response);
      endpoints.push({
        operation: endpoint.operation,
        ok: true,
        status: response.status,
        elapsedMs: response.elapsedMs,
        errorKind: 'none',
        message: 'Jikan endpoint responded successfully.',
      });
    } catch (error: unknown) {
      const errorKind = classifyError(error);
      rateLimited = errorKind === 'rate_limit';
      endpoints.push({
        operation: endpoint.operation,
        ok: false,
        status: statusFromError(error),
        elapsedMs: Math.max(0, now() - startedAt),
        errorKind,
        message: diagnosticMessage(error),
      });
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Jikan] endpoint diagnostic failed', {
          operation: endpoint.operation,
          status: statusFromError(error),
          errorKind,
          message: diagnosticMessage(error),
        });
      }
    }
  }

  return {
    platform: Platform.OS,
    health: healthFromResults(endpoints),
    endpoints,
  };
}
