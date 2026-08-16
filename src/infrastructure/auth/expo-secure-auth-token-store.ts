import * as SecureStore from 'expo-secure-store';

import type {
  AuthTokenRecord,
  AuthTokenStore,
} from '@/application/auth/auth-contracts';
import { AuthTokenStoreError } from '@/application/auth/auth-contracts';
import type { AuthProviderId } from '@/domain/models/auth';

export interface SecureStorePort {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const expoSecureStore: SecureStorePort = {
  getItemAsync: SecureStore.getItemAsync,
  setItemAsync: SecureStore.setItemAsync,
  deleteItemAsync: SecureStore.deleteItemAsync,
};

export function authTokenStorageKey(provider: AuthProviderId): string {
  return `puriki.auth.${provider}.v1`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableToken(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return (
    Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value
  );
}

export function parseAuthTokenRecord(value: unknown): AuthTokenRecord | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.accessToken !== 'string' ||
    value.accessToken.trim().length === 0 ||
    !isNullableToken(value.refreshToken) ||
    !isIsoDate(value.expiresAt)
  ) {
    return null;
  }
  return {
    version: 1,
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresAt: value.expiresAt,
  };
}

export class ExpoSecureAuthTokenStore implements AuthTokenStore {
  constructor(
    private readonly secureStore: SecureStorePort = expoSecureStore,
  ) {}

  async get(provider: AuthProviderId): Promise<AuthTokenRecord | null> {
    const key = authTokenStorageKey(provider);
    let stored: string | null;
    try {
      stored = await this.secureStore.getItemAsync(key);
    } catch {
      throw new AuthTokenStoreError('read');
    }
    if (stored === null) return null;

    let record: AuthTokenRecord | null = null;
    try {
      record = parseAuthTokenRecord(JSON.parse(stored) as unknown);
    } catch {
      record = null;
    }
    if (record) return record;

    let cleanupFailed = false;
    try {
      await this.secureStore.deleteItemAsync(key);
    } catch {
      cleanupFailed = true;
    }
    throw new AuthTokenStoreError('corrupt', cleanupFailed);
  }

  async set(provider: AuthProviderId, value: AuthTokenRecord): Promise<void> {
    if (!parseAuthTokenRecord(value)) throw new AuthTokenStoreError('corrupt');
    try {
      await this.secureStore.setItemAsync(
        authTokenStorageKey(provider),
        JSON.stringify(value),
      );
    } catch {
      throw new AuthTokenStoreError('write');
    }
  }

  async remove(provider: AuthProviderId): Promise<void> {
    try {
      await this.secureStore.deleteItemAsync(authTokenStorageKey(provider));
    } catch {
      throw new AuthTokenStoreError('remove');
    }
  }
}
