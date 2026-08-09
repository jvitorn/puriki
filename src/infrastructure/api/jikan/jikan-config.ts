export const DEFAULT_JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

// Official public limits: 3 requests/second and 60 requests/minute.
export const JIKAN_REQUEST_POLICY = {
  requestIntervalMs: 500,
  sustainedRequestLimit: 60,
  sustainedWindowMs: 60_000,
  retryAfterFallbackMs: 15_000,
} as const;

export function normalizeJikanBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export const JIKAN_BASE_URL =
  normalizeJikanBaseUrl(process.env.EXPO_PUBLIC_JIKAN_BASE_URL ?? '') ||
  DEFAULT_JIKAN_BASE_URL;
