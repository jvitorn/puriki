import { Platform } from 'react-native';

import {
  createNativeJikanTransport,
  type NativeJikanClientOptions,
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

export interface JikanConnectivityResult {
  ok: boolean;
  platform: string;
  status: number | null;
  elapsedMs: number;
  errorKind: 'none' | 'http' | 'network' | 'timeout' | 'format';
  message: string;
}

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

function classifyError(error: unknown): JikanConnectivityResult['errorKind'] {
  if (error instanceof JikanTimeoutError) return 'timeout';
  if (error instanceof JikanNetworkError) return 'network';
  if (error instanceof JikanResponseFormatError) return 'format';
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
  if (error instanceof Error) return error.message;
  return 'The Jikan connectivity request failed.';
}

export async function runJikanConnectivityDiagnostic(
  options: NativeJikanClientOptions = {},
): Promise<JikanConnectivityResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const result = await createNativeJikanTransport(options).get(
      'connectivity-diagnostic',
      '/top/anime',
      { limit: 1, sfw: true },
    );
    return {
      ok: true,
      platform: Platform.OS,
      status: result.status,
      elapsedMs: result.elapsedMs,
      errorKind: 'none',
      message: 'Jikan responded successfully through the native transport.',
    };
  } catch (error: unknown) {
    return {
      ok: false,
      platform: Platform.OS,
      status: statusFromError(error),
      elapsedMs: Math.max(0, now() - startedAt),
      errorKind: classifyError(error),
      message: diagnosticMessage(error),
    };
  }
}
