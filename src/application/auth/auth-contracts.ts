import type {
  AccountConnectionState,
  AuthProviderId,
  ConnectedAccount,
} from '@/domain/models/auth';

export type AuthFailureCode =
  | 'cancelled'
  | 'configuration'
  | 'unsupported_environment'
  | 'redirect'
  | 'network'
  | 'timeout'
  | 'provider_unavailable'
  | 'invalid_token'
  | 'invalid_response'
  | 'storage'
  | 'unknown';

export class AuthOperationError extends Error {
  constructor(
    readonly code: AuthFailureCode,
    options: {
      cancelled?: boolean;
      canRetry?: boolean;
      reconnectRequired?: boolean;
    } = {},
  ) {
    super(code);
    this.name = 'AuthOperationError';
    this.cancelled = options.cancelled ?? false;
    this.canRetry = options.canRetry ?? false;
    this.reconnectRequired = options.reconnectRequired ?? false;
  }

  readonly cancelled: boolean;
  readonly canRetry: boolean;
  readonly reconnectRequired: boolean;
}

export type AuthTokenStoreFailure = 'corrupt' | 'read' | 'write' | 'remove';

export class AuthTokenStoreError extends Error {
  constructor(
    readonly reason: AuthTokenStoreFailure,
    readonly cleanupFailed = false,
  ) {
    super(reason);
    this.name = 'AuthTokenStoreError';
  }
}

export interface AuthTokenRecord {
  version: 1;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
}

export interface AuthTokenStore {
  get(provider: AuthProviderId): Promise<AuthTokenRecord | null>;
  set(provider: AuthProviderId, value: AuthTokenRecord): Promise<void>;
  remove(provider: AuthProviderId): Promise<void>;
}

export type AuthRestoreResult =
  | { state: 'disconnected' }
  | { state: 'connected'; account: ConnectedAccount }
  | { state: 'reconnect_required'; failure?: AuthFailureCode };

export interface AuthProvider {
  readonly id: AuthProviderId;
  signIn(): Promise<ConnectedAccount>;
  restoreSession(): Promise<AuthRestoreResult>;
  signOut(): Promise<void>;
}

export type AuthSessionPhase = 'restoring' | 'ready';

export type AuthSessionOperation =
  'idle' | 'restoring' | 'signing_in' | 'signing_out';

export interface ProviderSessionSnapshot {
  state: AccountConnectionState;
  account: ConnectedAccount | null;
  operation: AuthSessionOperation;
  failure: AuthFailureCode | null;
  canRetry: boolean;
}

export interface AuthSessionSnapshot {
  phase: AuthSessionPhase;
  connections: Record<AuthProviderId, ProviderSessionSnapshot>;
}

export interface AuthSessionController {
  getSnapshot(): AuthSessionSnapshot;
  subscribe(listener: () => void): () => void;
  restore(): Promise<void>;
  signIn(provider: AuthProviderId): Promise<void>;
  retry(provider: AuthProviderId): Promise<void>;
  signOut(provider: AuthProviderId): Promise<void>;
  markReconnectRequired(provider: AuthProviderId): Promise<void>;
}
