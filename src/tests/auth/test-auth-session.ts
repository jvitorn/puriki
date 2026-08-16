import type {
  AuthSessionController,
  AuthSessionSnapshot,
  ProviderSessionSnapshot,
} from '@/application/auth/auth-contracts';
import { AUTH_PROVIDER_IDS } from '@/domain/models/auth';
import type { AuthProviderId } from '@/domain/models/auth';

function disconnectedConnection(): ProviderSessionSnapshot {
  return {
    state: 'disconnected',
    account: null,
    operation: 'idle',
    failure: null,
    canRetry: false,
  };
}

export class TestAuthSessionController implements AuthSessionController {
  private readonly listeners = new Set<() => void>();
  private snapshot: AuthSessionSnapshot;

  constructor(initialSnapshot?: Partial<AuthSessionSnapshot>) {
    this.snapshot = {
      phase: initialSnapshot?.phase ?? 'ready',
      connections:
        initialSnapshot?.connections ??
        (Object.fromEntries(
          AUTH_PROVIDER_IDS.map((provider) => [
            provider,
            disconnectedConnection(),
          ]),
        ) as AuthSessionSnapshot['connections']),
    };
  }

  getSnapshot = (): AuthSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  restore = async (): Promise<void> => undefined;

  signIn = async (_provider: AuthProviderId): Promise<void> => undefined;

  retry = async (_provider: AuthProviderId): Promise<void> => undefined;

  signOut = async (_provider: AuthProviderId): Promise<void> => undefined;

  markReconnectRequired = async (_provider: AuthProviderId): Promise<void> =>
    undefined;

  update(snapshot: AuthSessionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  updateConnection(
    provider: AuthProviderId,
    connection: ProviderSessionSnapshot,
  ): void {
    this.update({
      ...this.snapshot,
      connections: { ...this.snapshot.connections, [provider]: connection },
    });
  }
}

export function createTestAuthSession(): TestAuthSessionController {
  return new TestAuthSessionController();
}
