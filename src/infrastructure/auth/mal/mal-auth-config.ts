export {
  MAL_CLIENT_ID,
  isMalClientIdConfigured,
} from '@/infrastructure/api/mal/mal-config';

export const MAL_CLIENT_SECRET =
  process.env.EXPO_PUBLIC_MAL_CLIENT_SECRET?.trim() ?? '';

export const MAL_AUTHORIZATION_ENDPOINT =
  'https://myanimelist.net/v1/oauth2/authorize';

export const MAL_TOKEN_ENDPOINT = 'https://myanimelist.net/v1/oauth2/token';

export const MAL_EXPECTED_REDIRECT_URI = 'puriki://auth/mal';
