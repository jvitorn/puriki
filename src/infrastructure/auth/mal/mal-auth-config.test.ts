import {
  MAL_AUTHORIZATION_ENDPOINT,
  MAL_EXPECTED_REDIRECT_URI,
  MAL_TOKEN_ENDPOINT,
  isMalClientIdConfigured,
} from '@/infrastructure/auth/mal/mal-auth-config';

describe('MAL auth configuration', () => {
  it('uses the official endpoints and registered native redirect', () => {
    expect(MAL_AUTHORIZATION_ENDPOINT).toBe(
      'https://myanimelist.net/v1/oauth2/authorize',
    );
    expect(MAL_TOKEN_ENDPOINT).toBe('https://myanimelist.net/v1/oauth2/token');
    expect(MAL_EXPECTED_REDIRECT_URI).toBe('puriki://auth/mal');
  });

  it('requires a non-empty public client ID', () => {
    expect(isMalClientIdConfigured(' 1234 ')).toBe(true);
    expect(isMalClientIdConfigured(' ')).toBe(false);
  });
});
