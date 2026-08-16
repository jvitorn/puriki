export const AUTH_PROVIDER_IDS = ['anilist', 'mal'] as const;

export type AuthProviderId = (typeof AUTH_PROVIDER_IDS)[number];

export type AccountConnectionState =
  'disconnected' | 'connected' | 'reconnect_required';

export interface ConnectedAccount {
  provider: AuthProviderId;
  userId: string;
  username: string;
  avatarUrl: string | null;
  expiresAt: string;
}
