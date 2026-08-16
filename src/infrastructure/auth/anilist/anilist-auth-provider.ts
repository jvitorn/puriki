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
import type {
  AniListViewer,
  AniListViewerClientPort,
} from '@/infrastructure/auth/anilist/anilist-viewer-client';
import type { AniListOAuthClientPort } from '@/infrastructure/auth/anilist/expo-anilist-oauth-client';

export interface AniListAuthProviderOptions {
  tokenStore: AuthTokenStore;
  oauthClient: AniListOAuthClientPort;
  viewerClient: AniListViewerClientPort;
  now?: () => number;
  platform?: string;
}

export class AniListAuthProvider implements AuthProvider {
  readonly id = 'anilist' as const;

  private readonly tokenStore: AuthTokenStore;
  private readonly oauthClient: AniListOAuthClientPort;
  private readonly viewerClient: AniListViewerClientPort;
  private readonly now: () => number;
  private readonly platform: string;

  constructor(options: AniListAuthProviderOptions) {
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
      refreshToken: null,
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

    if (Date.parse(record.expiresAt) <= this.now()) {
      const failure = await this.removeInvalidCredential();
      return {
        state: 'reconnect_required',
        failure: failure ? 'storage' : undefined,
      };
    }

    try {
      const viewer = await this.viewerClient.getViewer(record.accessToken);
      return {
        state: 'connected',
        account: this.toAccount(viewer, record.expiresAt),
      };
    } catch (error: unknown) {
      if (error instanceof AuthOperationError && error.reconnectRequired) {
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

  private toAccount(
    viewer: AniListViewer,
    expiresAt: string,
  ): ConnectedAccount {
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
