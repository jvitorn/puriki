import {
  ANILIST_AUTHORIZATION_ENDPOINT,
  ANILIST_EXPECTED_REDIRECT_URI,
  isAniListClientIdConfigured,
} from '@/infrastructure/auth/anilist/anilist-auth-config';

describe('AniList auth configuration', () => {
  it('uses the official endpoint and registered native redirect', () => {
    expect(ANILIST_AUTHORIZATION_ENDPOINT).toBe(
      'https://anilist.co/api/v2/oauth/authorize',
    );
    expect(ANILIST_EXPECTED_REDIRECT_URI).toBe('puriki://auth/anilist');
  });

  it('requires a non-empty public client ID', () => {
    expect(isAniListClientIdConfigured(' 1234 ')).toBe(true);
    expect(isAniListClientIdConfigured(' ')).toBe(false);
  });
});
