import { Platform } from 'react-native';

import {
  createNativeMalTransport,
  type MalClientOptions,
} from '@/infrastructure/api/mal/mal-client';
import { isMalCollectionResponse } from '@/infrastructure/api/mal/mal-dtos';
import {
  MalConfigurationError,
  MalHttpError,
  MalNetworkError,
  MalRateLimitError,
  MalResponseFormatError,
  MalServiceUnavailableError,
  MalTimeoutError,
  MalUnauthorizedError,
} from '@/infrastructure/api/mal/mal-errors';
import { MAL_DIAGNOSTIC_FIELDS } from '@/infrastructure/api/mal/mal-fields';

export type MalConnectivityErrorKind =
  | 'none'
  | 'not_configured'
  | 'unauthorized'
  | 'http'
  | 'rate_limit'
  | 'service_unavailable'
  | 'network'
  | 'timeout'
  | 'invalid_response';

export interface MalConnectivityResult {
  ok: boolean;
  platform: string;
  status: number | null;
  elapsedMs: number;
  errorKind: MalConnectivityErrorKind;
  message: string;
  sampleAnimeTitle: string | null;
}

function errorKind(error: unknown): MalConnectivityErrorKind {
  if (error instanceof MalConfigurationError) return 'not_configured';
  if (error instanceof MalUnauthorizedError) return 'unauthorized';
  if (error instanceof MalRateLimitError) return 'rate_limit';
  if (error instanceof MalServiceUnavailableError) {
    return 'service_unavailable';
  }
  if (error instanceof MalNetworkError) return 'network';
  if (error instanceof MalTimeoutError) return 'timeout';
  if (error instanceof MalResponseFormatError) return 'invalid_response';
  return 'http';
}

function statusFromError(error: unknown): number | null {
  if (error instanceof MalRateLimitError) return 429;
  if (
    error instanceof MalHttpError ||
    error instanceof MalServiceUnavailableError ||
    error instanceof MalUnauthorizedError
  ) {
    return error.status;
  }
  if (
    error instanceof MalNetworkError ||
    error instanceof MalResponseFormatError ||
    error instanceof MalTimeoutError
  ) {
    return error.diagnostic.status ?? null;
  }
  return null;
}

function messageForError(error: unknown): string {
  if (error instanceof MalConfigurationError) {
    return 'MyAnimeList Client ID is not configured.';
  }
  if (error instanceof MalUnauthorizedError) {
    return 'MyAnimeList rejected the application Client ID.';
  }
  if (error instanceof MalRateLimitError) {
    return 'MyAnimeList is receiving too many requests.';
  }
  if (error instanceof MalServiceUnavailableError) {
    return 'The MyAnimeList API is temporarily unavailable.';
  }
  if (error instanceof MalNetworkError) {
    return 'Unable to reach the MyAnimeList API.';
  }
  if (error instanceof MalTimeoutError) {
    return 'MyAnimeList took too long to respond.';
  }
  if (error instanceof MalResponseFormatError) {
    return 'MyAnimeList returned an invalid response.';
  }
  return 'The MyAnimeList API request failed.';
}

export async function runMalConnectivityDiagnostic(
  options: MalClientOptions = {},
): Promise<MalConnectivityResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const response = await createNativeMalTransport({
      ...options,
      maximumAttempts: Math.min(2, options.maximumAttempts ?? 2),
    }).get('connectivity-diagnostic', '/anime/ranking', {
      fields: MAL_DIAGNOSTIC_FIELDS,
      limit: 1,
      ranking_type: 'bypopularity',
    });
    if (!isMalCollectionResponse(response.data) || !response.data.data[0]) {
      throw new MalResponseFormatError(
        'MyAnimeList returned no diagnostic sample.',
        {
          status: response.status,
          url: response.url,
          elapsedMs: response.elapsedMs,
        },
      );
    }
    return {
      ok: true,
      platform: Platform.OS,
      status: response.status,
      elapsedMs: response.elapsedMs,
      errorKind: 'none',
      message: 'MyAnimeList API is operational.',
      sampleAnimeTitle: response.data.data[0].node.title,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      platform: Platform.OS,
      status: statusFromError(error),
      elapsedMs: Math.max(0, now() - startedAt),
      errorKind: errorKind(error),
      message: messageForError(error),
      sampleAnimeTitle: null,
    };
  }
}
