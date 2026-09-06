import {
  logOAuthCallbackDiagnostic,
  safeCallbackUrlParts,
} from '@/infrastructure/auth/oauth-diagnostics';

describe('safeCallbackUrlParts', () => {
  it('extracts only scheme/host/path, never query or fragment content', () => {
    expect(
      safeCallbackUrlParts(
        'puriki://auth/anilist#access_token=super-secret&state=abc',
      ),
    ).toEqual({ scheme: 'puriki', host: 'auth', path: '/anilist' });
  });

  it('returns null for an unparsable callback URL', () => {
    expect(safeCallbackUrlParts('not a url')).toBeNull();
  });
});

describe('logOAuthCallbackDiagnostic', () => {
  const diagnostic = {
    provider: 'anilist' as const,
    expectedRedirectUri: 'puriki://auth/anilist',
    resultType: 'success',
    callback: { scheme: 'puriki', host: 'auth', path: '/anilist' },
    stateMatches: true,
    failureCategory: null,
  };

  it('forwards the diagnostic to the logger', () => {
    const logger = jest.fn();
    logOAuthCallbackDiagnostic(logger, diagnostic);
    expect(logger).toHaveBeenCalledWith(diagnostic);
  });

  it('never lets a failing logger interrupt sign-in', () => {
    const logger = jest.fn(() => {
      throw new Error('logger failure');
    });
    expect(() => logOAuthCallbackDiagnostic(logger, diagnostic)).not.toThrow();
  });
});
