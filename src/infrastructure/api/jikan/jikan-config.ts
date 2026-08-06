export const DEFAULT_JIKAN_BASE_URL = 'https://api.jikan.moe/v4';

export function normalizeJikanBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

export const JIKAN_BASE_URL =
  normalizeJikanBaseUrl(process.env.EXPO_PUBLIC_JIKAN_BASE_URL ?? '') ||
  DEFAULT_JIKAN_BASE_URL;
