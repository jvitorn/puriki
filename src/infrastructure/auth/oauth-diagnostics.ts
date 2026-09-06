import type { AuthFailureCode } from '@/application/auth/auth-contracts';

export interface SafeCallbackUrlParts {
  scheme: string;
  host: string;
  path: string;
}

export interface OAuthCallbackDiagnostic {
  provider: 'anilist' | 'mal';
  expectedRedirectUri: string;
  resultType: string | null;
  callback: SafeCallbackUrlParts | null;
  stateMatches: boolean | null;
  failureCategory: AuthFailureCode | null;
}

/**
 * Extracts only the scheme/host/path of a callback URL. Never returns query
 * or fragment content, since AniList's implicit grant carries the access
 * token in the fragment and must never reach logs.
 */
export function safeCallbackUrlParts(url: string): SafeCallbackUrlParts | null {
  try {
    const parsed = new URL(url);
    return {
      scheme: parsed.protocol.replace(/:$/, ''),
      host: parsed.hostname,
      path: parsed.pathname,
    };
  } catch {
    return null;
  }
}

/**
 * Production-safe OAuth callback diagnostic. Unlike the pre-request
 * diagnostic logger (dev-only), this is intended to remain active in release
 * builds so a real device/APK can be diagnosed without shipping another
 * debug build: it only ever carries provider id, expected redirect URI,
 * result type, callback scheme/host/path, state-match boolean, and a
 * high-level failure category — never a token, code, or secret.
 */
export function logOAuthCallbackDiagnostic(
  logger: (diagnostic: OAuthCallbackDiagnostic) => void,
  diagnostic: OAuthCallbackDiagnostic,
): void {
  try {
    logger(diagnostic);
  } catch {
    // Diagnostics must never interrupt sign-in.
  }
}

export function defaultOAuthCallbackDiagnosticLogger(
  diagnostic: OAuthCallbackDiagnostic,
): void {
  console.info('[OAuth] Callback result', diagnostic);
}
