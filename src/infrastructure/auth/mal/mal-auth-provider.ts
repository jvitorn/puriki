import { Platform } from 'react-native';

import type {
  AuthProvider,
  AuthRestoreResult,
  AuthTokenRecord,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import {
  AuthOperationError,
  AuthTokenStoreError,
} from '@/application/auth/auth-contracts';
import type { ConnectedAccount } from '@/domain/models/auth';
import type { MalOAuthClientPort } from '@/infrastructure/auth/mal/expo-mal-oauth-client';
import type {
  MalViewer,
  MalViewerClientPort,
} from '@/infrastructure/auth/mal/mal-viewer-client';

const REFRESH_SAFETY_MARGIN_MS = 60_000;

export interface MalAuthProviderOptions {
  tokenStore: AuthTokenStore;
  oauthClient: MalOAuthClientPort;
  viewerClient: MalViewerClientPort;
  now?: () => number;
  platform?: string;
}

export class MalAuthProvider implements AuthProvider {
  readonly id = 'mal' as const;

  private readonly tokenStore: AuthTokenStore;
  private readonly oauthClient: MalOAuthClientPort;
  private readonly viewerClient: MalViewerClientPort;
  private readonly now: () => number;
  private readonly platform: string;

  constructor(options: MalAuthProviderOptions) {
    this.tokenStore = options.tokenStore;
    this.oauthClient = options.oauthClient;
    this.viewerClient = options.viewerClient;
    this.now = options.now ?? Date.now;
    this.platform = options.platform ?? Platform.OS;
  }

  async signIn(): Promise<ConnectedAccount> {
    if (!this.isSupportedPlatform()) {
      throw new AuthOperationError('unsupported_environment');
    }
    const credential = await this.oauthClient.authorize();
    const record: AuthTokenRecord = {
      version: 1,
      accessToken: credential.accessToken,
      refreshToken: credential.refreshToken,
      expiresAt: credential.expiresAt,
    };
    try {
      await this.tokenStore.set(this.id, record);
    } catch {
      throw new AuthOperationError('storage');
    }

    try {
      const viewer = await this.viewerClient.getViewer(record.accessToken);
      return this.toAccount(viewer, record.expiresAt);
    } catch (error: unknown) {
      if (error instanceof AuthOperationError && error.reconnectRequired) {
        await this.removeInvalidCredential();
      }
      throw error;
    }
  }

  async restoreSession(): Promise<AuthRestoreResult> {
    if (!this.isSupportedPlatform()) return { state: 'disconnected' };

    let record: AuthTokenRecord | null;
    try {
      record = await this.tokenStore.get(this.id);
    } catch (error: unknown) {
      if (error instanceof AuthTokenStoreError && error.reason === 'corrupt') {
        return {
          state: 'reconnect_required',
          failure: error.cleanupFailed ? 'storage' : undefined,
        };
      }
      throw new AuthOperationError('storage', { canRetry: true });
    }
    if (!record) return { state: 'disconnected' };

    if (this.isExpiredOrNearExpiry(record.expiresAt)) {
      const refreshed = await this.tryRefresh(record);
      if (!refreshed) {
        const failure = await this.removeInvalidCredential();
        return {
          state: 'reconnect_required',
          failure: failure ? 'storage' : undefined,
        };
      }
      record = refreshed;
    }

    try {
      const viewer = await this.viewerClient.getViewer(record.accessToken);
      return {
        state: 'connected',
        account: this.toAccount(viewer, record.expiresAt),
      };
    } catch (error: unknown) {
      if (error instanceof AuthOperationError && error.reconnectRequired) {
        const refreshed = await this.tryRefresh(record);
        if (refreshed) {
          try {
            const viewer = await this.viewerClient.getViewer(
              refreshed.accessToken,
            );
            return {
              state: 'connected',
              account: this.toAccount(viewer, refreshed.expiresAt),
            };
          } catch {
            // Fall through: treat as reconnect required below.
          }
        }
        const failure = await this.removeInvalidCredential();
        return {
          state: 'reconnect_required',
          failure: failure ? 'storage' : undefined,
        };
      }
      if (error instanceof AuthOperationError) throw error;
      throw new AuthOperationError('unknown', { canRetry: true });
    }
  }

  async signOut(): Promise<void> {
    if (!this.isSupportedPlatform()) return;
    try {
      await this.tokenStore.remove(this.id);
    } catch {
      throw new AuthOperationError('storage');
    }
  }

  private isSupportedPlatform(): boolean {
    return this.platform === 'android' || this.platform === 'ios';
  }

  private isExpiredOrNearExpiry(expiresAt: string): boolean {
    return Date.parse(expiresAt) <= this.now() + REFRESH_SAFETY_MARGIN_MS;
  }

  private async tryRefresh(
    record: AuthTokenRecord,
  ): Promise<AuthTokenRecord | null> {
    if (!record.refreshToken) return null;
    try {
      const credential = await this.oauthClient.refresh(record.refreshToken);
      const refreshed: AuthTokenRecord = {
        version: 1,
        accessToken: credential.accessToken,
        refreshToken: credential.refreshToken,
        expiresAt: credential.expiresAt,
      };
      await this.tokenStore.set(this.id, refreshed);
      return refreshed;
    } catch {
      return null;
    }
  }

  private toAccount(viewer: MalViewer, expiresAt: string): ConnectedAccount {
    return {
      provider: this.id,
      userId: String(viewer.id),
      username: viewer.name,
      avatarUrl: viewer.avatarUrl,
      expiresAt,
    };
  }

  private async removeInvalidCredential(): Promise<boolean> {
    try {
      await this.tokenStore.remove(this.id);
      return false;
    } catch {
      return true;
    }
  }
}
