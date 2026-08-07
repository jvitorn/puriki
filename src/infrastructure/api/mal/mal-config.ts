export const DEFAULT_MAL_BASE_URL = 'https://api.myanimelist.net/v2';

export const MAL_CLIENT_ID =
  process.env.EXPO_PUBLIC_MAL_CLIENT_ID?.trim() ?? '';

export const MAL_BASE_URL = DEFAULT_MAL_BASE_URL;

export function isMalClientIdConfigured(clientId: string): boolean {
  return clientId.trim().length > 0;
}

export const isMalConfigured = isMalClientIdConfigured(MAL_CLIENT_ID);

export function normalizeMalBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}
