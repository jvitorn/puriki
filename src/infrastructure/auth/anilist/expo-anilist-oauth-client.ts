import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { WebBrowserAuthSessionResult } from 'expo-web-browser';
import { Platform } from 'react-native';

import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  ANILIST_AUTHORIZATION_ENDPOINT,
  ANILIST_CLIENT_ID,
  ANILIST_EXPECTED_REDIRECT_URI,
  isAniListClientIdConfigured,
} from '@/infrastructure/auth/anilist/anilist-auth-config';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const ANILIST_RESPONSE_TYPE = 'token' as const;

export interface AniListOAuthCredential {
  accessToken: string;
  expiresAt: string;
}

export interface AniListOAuthClientPort {
  authorize(): Promise<AniListOAuthCredential>;
}

export interface AniListAuthorizationDiagnostic {
  clientId: string;
  redirectUri: string;
  responseType: typeof ANILIST_RESPONSE_TYPE;
  authorizationUrl: string;
}

export interface ExpoAniListOAuthClientOptions {
  clientId?: string;
  platform?: string;
  now?: () => number;
  makeRedirectUriImpl?: typeof makeRedirectUri;
  openAuthSessionImpl?: typeof WebBrowser.openAuthSessionAsync;
  stateFactory?: () => string;
  completeAuthSession?: () => unknown;
  isDevelopment?: boolean;
  diagnosticLogger?: (diagnostic: AniListAuthorizationDiagnostic) => void;
}

function buildAuthorizationUrl(clientId: string, state: string): string {
  const url = new URL(ANILIST_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', ANILIST_RESPONSE_TYPE);
  url.searchParams.set('state', state);
  return url.toString();
}

function sanitizedAuthorizationUrl(authorizationUrl: string): string {
  try {
    const url = new URL(authorizationUrl);
    for (const parameter of ['access_token', 'client_secret']) {
      if (url.searchParams.has(parameter)) {
        url.searchParams.set(parameter, '[REDACTED]');
      }
    }
    url.hash = '';
    return url.toString();
  } catch {
    return '[invalid authorization URL]';
  }
}

function returnParameters(returnUrl: string): Record<string, string> | null {
  try {
    const url = new URL(returnUrl);
    if (
      url.protocol !== 'puriki:' ||
      url.hostname !== 'auth' ||
      url.pathname !== '/anilist'
    ) {
      return null;
    }
    const params = Object.fromEntries(url.searchParams);
    new URLSearchParams(url.hash.replace(/^#/, '')).forEach((value, key) => {
      params[key] = value;
    });
    return params;
  } catch {
    return null;
  }
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class ExpoAniListOAuthClient implements AniListOAuthClientPort {
  private readonly clientId: string;
  private readonly platform: string;
  private readonly now: () => number;
  private readonly makeRedirect: typeof makeRedirectUri;
  private readonly openAuthSession: typeof WebBrowser.openAuthSessionAsync;
  private readonly createState: () => string;
  private readonly diagnosticLogger:
    ((diagnostic: AniListAuthorizationDiagnostic) => void) | null;

  constructor(options: ExpoAniListOAuthClientOptions = {}) {
    this.clientId = options.clientId ?? ANILIST_CLIENT_ID;
    this.platform = options.platform ?? Platform.OS;
    this.now = options.now ?? Date.now;
    this.makeRedirect = options.makeRedirectUriImpl ?? makeRedirectUri;
    this.openAuthSession =
      options.openAuthSessionImpl ?? WebBrowser.openAuthSessionAsync;
    this.createState = options.stateFactory ?? Crypto.randomUUID;
    const isDevelopment = options.isDevelopment ?? __DEV__;
    this.diagnosticLogger = isDevelopment
      ? (options.diagnosticLogger ??
        ((diagnostic) => {
          console.info('[AniList OAuth] Authorization request', diagnostic);
        }))
      : null;
    try {
      (options.completeAuthSession ?? WebBrowser.maybeCompleteAuthSession)();
    } catch {
      // Native platforms do not need to complete a web popup.
    }
  }

  async authorize(): Promise<AniListOAuthCredential> {
    if (!isAniListClientIdConfigured(this.clientId)) {
      throw new AuthOperationError('configuration');
    }
    if (this.platform !== 'android' && this.platform !== 'ios') {
      throw new AuthOperationError('unsupported_environment');
    }

    const redirectUri = this.makeRedirect({
      scheme: 'puriki',
      path: 'auth/anilist',
    });
    if (redirectUri !== ANILIST_EXPECTED_REDIRECT_URI) {
      const failureCode = redirectUri.startsWith('exp://')
        ? 'unsupported_environment'
        : 'redirect';
      throw new AuthOperationError(failureCode);
    }

    let result: WebBrowserAuthSessionResult;
    let state: string;
    try {
      state = this.createState();
      if (state.trim().length === 0) throw new Error('Invalid OAuth state');
      const authorizationUrl = buildAuthorizationUrl(this.clientId, state);
      try {
        this.diagnosticLogger?.({
          clientId: this.clientId,
          redirectUri,
          responseType: ANILIST_RESPONSE_TYPE,
          authorizationUrl: sanitizedAuthorizationUrl(authorizationUrl),
        });
      } catch {
        // Diagnostics must never interrupt sign-in.
      }
      result = await this.openAuthSession(authorizationUrl, redirectUri);
    } catch {
      throw new AuthOperationError('provider_unavailable', { canRetry: true });
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (result.type !== 'success') {
      throw new AuthOperationError('invalid_response');
    }

    const params = returnParameters(result.url);
    if (!params || params.state !== state) {
      throw new AuthOperationError('invalid_response');
    }
    if (params.error === 'access_denied') {
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (params.error) {
      throw new AuthOperationError('invalid_response');
    }

    const accessToken = params.access_token;
    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new AuthOperationError('invalid_response');
    }

    const issuedAt = this.now() / 1_000;
    const expiresIn = positiveNumber(params.expires_in) ?? ONE_YEAR_SECONDS;

    return {
      accessToken,
      expiresAt: new Date((issuedAt + expiresIn) * 1_000).toISOString(),
    };
  }
}
