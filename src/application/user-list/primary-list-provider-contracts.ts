import type { AuthProviderId } from '@/domain/models/auth';

export interface PrimaryListProviderSnapshot {
  phase: 'loading' | 'ready';
  selected: AuthProviderId | null;
}

export interface PrimaryListProviderStore {
  get(): Promise<AuthProviderId | null>;
  set(provider: AuthProviderId): Promise<void>;
  clear(): Promise<void>;
}

export interface PrimaryListProviderController {
  getSnapshot(): PrimaryListProviderSnapshot;
  subscribe(listener: () => void): () => void;
  hydrate(): Promise<void>;
  select(provider: AuthProviderId): Promise<void>;
  clear(): Promise<void>;
}
