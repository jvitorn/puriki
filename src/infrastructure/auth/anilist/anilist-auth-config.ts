export const ANILIST_CLIENT_ID =
  process.env.EXPO_PUBLIC_ANILIST_CLIENT_ID?.trim() ?? '';

export const ANILIST_AUTHORIZATION_ENDPOINT =
  'https://anilist.co/api/v2/oauth/authorize';

export const ANILIST_EXPECTED_REDIRECT_URI = 'puriki://auth/anilist';

export function isAniListClientIdConfigured(clientId: string): boolean {
  return clientId.trim().length > 0;
}
