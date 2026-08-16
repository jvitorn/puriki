import { AuthRequest, makeRedirectUri, ResponseType } from 'expo-auth-session';
import type {
  AuthDiscoveryDocument,
  AuthRequestConfig,
  AuthSessionResult,
} from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  ANILIST_AUTHORIZATION_ENDPOINT,
  ANILIST_CLIENT_ID,
  ANILIST_EXPECTED_REDIRECT_URI,
  isAniListClientIdConfigured,
} from '@/infrastructure/auth/anilist/anilist-auth-config';

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const ANILIST_AUTH_DISCOVERY: AuthDiscoveryDocument = {
  authorizationEndpoint: ANILIST_AUTHORIZATION_ENDPOINT,
};

export interface AniListOAuthCredential {
  accessToken: string;
  expiresAt: string;
}

export interface AniListOAuthClientPort {
  authorize(): Promise<AniListOAuthCredential>;
}

interface AuthRequestPort {
  promptAsync(discovery: AuthDiscoveryDocument): Promise<AuthSessionResult>;
}

export interface ExpoAniListOAuthClientOptions {
  clientId?: string;
  platform?: string;
  now?: () => number;
  makeRedirectUriImpl?: typeof makeRedirectUri;
  authRequestFactory?: (config: AuthRequestConfig) => AuthRequestPort;
  completeAuthSession?: () => unknown;
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
  private readonly createRequest: (
    config: AuthRequestConfig,
  ) => AuthRequestPort;

  constructor(options: ExpoAniListOAuthClientOptions = {}) {
    this.clientId = options.clientId ?? ANILIST_CLIENT_ID;
    this.platform = options.platform ?? Platform.OS;
    this.now = options.now ?? Date.now;
    this.makeRedirect = options.makeRedirectUriImpl ?? makeRedirectUri;
    this.createRequest =
      options.authRequestFactory ?? ((config) => new AuthRequest(config));
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

    const request = this.createRequest({
      clientId: this.clientId,
      redirectUri,
      responseType: ResponseType.Token,
      usePKCE: false,
    });

    let result: AuthSessionResult;
    try {
      result = await request.promptAsync(ANILIST_AUTH_DISCOVERY);
    } catch {
      throw new AuthOperationError('provider_unavailable', { canRetry: true });
    }

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (result.type === 'error' && result.params.error === 'access_denied') {
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (result.type !== 'success') {
      throw new AuthOperationError('invalid_response');
    }

    const accessToken =
      result.authentication?.accessToken ?? result.params.access_token;
    if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
      throw new AuthOperationError('invalid_response');
    }

    const issuedAt =
      positiveNumber(result.authentication?.issuedAt) ?? this.now() / 1_000;
    const expiresIn =
      positiveNumber(result.authentication?.expiresIn) ??
      positiveNumber(result.params.expires_in) ??
      ONE_YEAR_SECONDS;

    return {
      accessToken,
      expiresAt: new Date((issuedAt + expiresIn) * 1_000).toISOString(),
    };
  }
}
