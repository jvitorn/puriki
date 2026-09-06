import { makeRedirectUri } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import type { WebBrowserAuthSessionResult } from 'expo-web-browser';
import { Platform } from 'react-native';

import type { AuthFailureCode } from '@/application/auth/auth-contracts';
import { AuthOperationError } from '@/application/auth/auth-contracts';
import {
  MAL_AUTHORIZATION_ENDPOINT,
  MAL_CLIENT_ID,
  MAL_CLIENT_SECRET,
  MAL_EXPECTED_REDIRECT_URI,
  MAL_TOKEN_ENDPOINT,
  isMalClientIdConfigured,
} from '@/infrastructure/auth/mal/mal-auth-config';
import { createCodeVerifier } from '@/infrastructure/auth/mal/pkce';
import type {
  OAuthCallbackDiagnostic,
  SafeCallbackUrlParts,
} from '@/infrastructure/auth/oauth-diagnostics';
import {
  defaultOAuthCallbackDiagnosticLogger,
  logOAuthCallbackDiagnostic,
  safeCallbackUrlParts,
} from '@/infrastructure/auth/oauth-diagnostics';

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_EXPIRES_IN_SECONDS = 3_600;
const MAL_RESPONSE_TYPE = 'code' as const;
const MAL_CODE_CHALLENGE_METHOD = 'plain' as const;

export interface MalOAuthCredential {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}

export interface MalOAuthClientPort {
  authorize(): Promise<MalOAuthCredential>;
  refresh(refreshToken: string): Promise<MalOAuthCredential>;
}

export interface MalAuthorizationDiagnostic {
  clientId: string;
  redirectUri: string;
  responseType: typeof MAL_RESPONSE_TYPE;
  authorizationUrl: string;
}

export interface ExpoMalOAuthClientOptions {
  clientId?: string;
  clientSecret?: string;
  platform?: string;
  now?: () => number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  makeRedirectUriImpl?: typeof makeRedirectUri;
  openAuthSessionImpl?: typeof WebBrowser.openAuthSessionAsync;
  stateFactory?: () => string;
  codeVerifierFactory?: () => string;
  completeAuthSession?: () => unknown;
  isDevelopment?: boolean;
  diagnosticLogger?: (diagnostic: MalAuthorizationDiagnostic) => void;
  callbackDiagnosticLogger?: (diagnostic: OAuthCallbackDiagnostic) => void;
}

interface TokenResponsePayload {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

function buildAuthorizationUrl(
  clientId: string,
  state: string,
  codeVerifier: string,
  redirectUri: string,
): string {
  const url = new URL(MAL_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', MAL_RESPONSE_TYPE);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code_challenge', codeVerifier);
  url.searchParams.set('code_challenge_method', MAL_CODE_CHALLENGE_METHOD);
  url.searchParams.set('state', state);
  return url.toString();
}

function sanitizedAuthorizationUrl(authorizationUrl: string): string {
  try {
    const url = new URL(authorizationUrl);
    for (const parameter of ['code_challenge', 'client_secret']) {
      if (url.searchParams.has(parameter)) {
        url.searchParams.set(parameter, '[REDACTED]');
      }
    }
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
      url.pathname !== '/mal'
    ) {
      return null;
    }
    return Object.fromEntries(url.searchParams);
  } catch {
    return null;
  }
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export class ExpoMalOAuthClient implements MalOAuthClientPort {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly platform: string;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly makeRedirect: typeof makeRedirectUri;
  private readonly openAuthSession: typeof WebBrowser.openAuthSessionAsync;
  private readonly createState: () => string;
  private readonly createCodeVerifierImpl: () => string;
  private readonly diagnosticLogger:
    ((diagnostic: MalAuthorizationDiagnostic) => void) | null;
  private readonly callbackDiagnosticLogger: (
    diagnostic: OAuthCallbackDiagnostic,
  ) => void;

  constructor(options: ExpoMalOAuthClientOptions = {}) {
    this.clientId = options.clientId ?? MAL_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? MAL_CLIENT_SECRET;
    this.platform = options.platform ?? Platform.OS;
    this.now = options.now ?? Date.now;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.makeRedirect = options.makeRedirectUriImpl ?? makeRedirectUri;
    this.openAuthSession =
      options.openAuthSessionImpl ?? WebBrowser.openAuthSessionAsync;
    this.createState = options.stateFactory ?? Crypto.randomUUID;
    this.createCodeVerifierImpl =
      options.codeVerifierFactory ?? (() => createCodeVerifier());
    const isDevelopment = options.isDevelopment ?? __DEV__;
    this.diagnosticLogger = isDevelopment
      ? (options.diagnosticLogger ??
        ((diagnostic) => {
          console.info('[MAL OAuth] Authorization request', diagnostic);
        }))
      : null;
    this.callbackDiagnosticLogger =
      options.callbackDiagnosticLogger ?? defaultOAuthCallbackDiagnosticLogger;
    try {
      (options.completeAuthSession ?? WebBrowser.maybeCompleteAuthSession)();
    } catch {
      // Native platforms do not need to complete a web popup.
    }
  }

  private logCallback(
    resultType: string | null,
    callback: SafeCallbackUrlParts | null,
    stateMatches: boolean | null,
    failureCategory: AuthFailureCode | null,
  ): void {
    logOAuthCallbackDiagnostic(this.callbackDiagnosticLogger, {
      provider: 'mal',
      expectedRedirectUri: MAL_EXPECTED_REDIRECT_URI,
      resultType,
      callback,
      stateMatches,
      failureCategory,
    });
  }

  async authorize(): Promise<MalOAuthCredential> {
    if (!isMalClientIdConfigured(this.clientId)) {
      throw new AuthOperationError('configuration');
    }
    if (this.platform !== 'android' && this.platform !== 'ios') {
      throw new AuthOperationError('unsupported_environment');
    }

    const redirectUri = this.makeRedirect({
      scheme: 'puriki',
      path: 'auth/mal',
    });
    if (redirectUri !== MAL_EXPECTED_REDIRECT_URI) {
      const failureCode = redirectUri.startsWith('exp://')
        ? 'unsupported_environment'
        : 'redirect';
      throw new AuthOperationError(failureCode);
    }

    let result: WebBrowserAuthSessionResult;
    let state: string;
    let codeVerifier: string;
    try {
      state = this.createState();
      codeVerifier = this.createCodeVerifierImpl();
      if (state.trim().length === 0) throw new Error('Invalid OAuth state');
      if (codeVerifier.trim().length === 0) {
        throw new Error('Invalid PKCE code verifier');
      }
      const authorizationUrl = buildAuthorizationUrl(
        this.clientId,
        state,
        codeVerifier,
        redirectUri,
      );
      try {
        this.diagnosticLogger?.({
          clientId: this.clientId,
          redirectUri,
          responseType: MAL_RESPONSE_TYPE,
          authorizationUrl: sanitizedAuthorizationUrl(authorizationUrl),
        });
      } catch {
        // Diagnostics must never interrupt sign-in.
      }
      result = await this.openAuthSession(authorizationUrl, redirectUri);
    } catch {
      this.logCallback(null, null, null, 'provider_unavailable');
      throw new AuthOperationError('provider_unavailable', { canRetry: true });
    }

    const callback =
      result.type === 'success' ? safeCallbackUrlParts(result.url) : null;

    if (result.type === 'cancel' || result.type === 'dismiss') {
      this.logCallback(result.type, callback, null, 'cancelled');
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (result.type !== 'success') {
      this.logCallback(result.type, callback, null, 'invalid_response');
      throw new AuthOperationError('invalid_response');
    }

    const params = returnParameters(result.url);
    const stateMatches = params ? params.state === state : null;
    if (!params || params.state !== state) {
      this.logCallback(result.type, callback, stateMatches, 'invalid_response');
      throw new AuthOperationError('invalid_response');
    }
    if (params.error === 'access_denied') {
      this.logCallback(result.type, callback, stateMatches, 'cancelled');
      throw new AuthOperationError('cancelled', { cancelled: true });
    }
    if (params.error) {
      this.logCallback(result.type, callback, stateMatches, 'invalid_response');
      throw new AuthOperationError('invalid_response');
    }

    const code = params.code;
    if (typeof code !== 'string' || code.trim().length === 0) {
      this.logCallback(result.type, callback, stateMatches, 'invalid_response');
      throw new AuthOperationError('invalid_response');
    }

    this.logCallback(result.type, callback, stateMatches, null);

    return this.exchangeToken({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
    });
  }

  async refresh(refreshToken: string): Promise<MalOAuthCredential> {
    if (!isMalClientIdConfigured(this.clientId)) {
      throw new AuthOperationError('configuration');
    }
    return this.exchangeToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async exchangeToken(
    fields: Record<string, string>,
  ): Promise<MalOAuthCredential> {
    const body = new URLSearchParams({ client_id: this.clientId, ...fields });
    if (this.clientSecret.length > 0) {
      body.set('client_secret', this.clientSecret);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchImpl(MAL_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });
      let payload: unknown;
      try {
        payload = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new AuthOperationError(
          response.status >= 500 ? 'provider_unavailable' : 'invalid_response',
          { canRetry: response.status >= 500 },
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new AuthOperationError('provider_unavailable', {
          canRetry: true,
        });
      }
      if (response.status < 200 || response.status >= 300) {
        throw new AuthOperationError('invalid_response');
      }
      return this.parseTokenPayload(payload);
    } catch (error: unknown) {
      if (error instanceof AuthOperationError) throw error;
      throw new AuthOperationError(timedOut ? 'timeout' : 'network', {
        canRetry: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseTokenPayload(payload: unknown): MalOAuthCredential {
    if (typeof payload !== 'object' || payload === null) {
      throw new AuthOperationError('invalid_response');
    }
    const record = payload as TokenResponsePayload;
    if (
      typeof record.access_token !== 'string' ||
      record.access_token.trim().length === 0 ||
      typeof record.refresh_token !== 'string' ||
      record.refresh_token.trim().length === 0
    ) {
      throw new AuthOperationError('invalid_response');
    }
    const expiresIn =
      positiveNumber(record.expires_in) ?? DEFAULT_EXPIRES_IN_SECONDS;
    return {
      accessToken: record.access_token,
      refreshToken: record.refresh_token,
      expiresAt: new Date(this.now() + expiresIn * 1_000).toISOString(),
    };
  }
}
