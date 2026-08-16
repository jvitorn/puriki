import type {
  AuthFailureCode,
  AuthProvider,
  AuthRestoreResult,
  AuthSessionController,
  AuthSessionOperation,
  AuthSessionSnapshot,
  ProviderSessionSnapshot,
} from '@/application/auth/auth-contracts';
import { AuthOperationError } from '@/application/auth/auth-contracts';
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

function initialConnections(): AuthSessionSnapshot['connections'] {
  return Object.fromEntries(
    AUTH_PROVIDER_IDS.map((provider) => [provider, disconnectedConnection()]),
  ) as AuthSessionSnapshot['connections'];
}

function restoreResultConnection(
  result: AuthRestoreResult,
): ProviderSessionSnapshot {
  if (result.state === 'connected') {
    return {
      state: 'connected',
      account: result.account,
      operation: 'idle',
      failure: null,
      canRetry: false,
    };
  }
  if (result.state === 'reconnect_required') {
    return {
      state: 'reconnect_required',
      account: null,
      operation: 'idle',
      failure: result.failure ?? null,
      canRetry: false,
    };
  }
  return disconnectedConnection();
}

function safeFailure(error: unknown): {
  code: AuthFailureCode;
  cancelled: boolean;
  canRetry: boolean;
  reconnectRequired: boolean;
} {
  if (error instanceof AuthOperationError) {
    return {
      code: error.code,
      cancelled: error.cancelled,
      canRetry: error.canRetry,
      reconnectRequired: error.reconnectRequired,
    };
  }
  return {
    code: 'unknown',
    cancelled: false,
    canRetry: false,
    reconnectRequired: false,
  };
}

export class AuthSessionCoordinator implements AuthSessionController {
  private readonly providers: ReadonlyMap<AuthProviderId, AuthProvider>;
  private readonly listeners = new Set<() => void>();
  private activeOperation: Promise<void> | null = null;
  private snapshot: AuthSessionSnapshot = {
    phase: 'restoring',
    connections: initialConnections(),
  };

  constructor(providers: readonly AuthProvider[]) {
    this.providers = new Map(
      providers.map((provider) => [provider.id, provider]),
    );
  }

  getSnapshot = (): AuthSessionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  restore = (): Promise<void> => {
    if (this.snapshot.phase === 'ready') return Promise.resolve();
    return this.runExclusive(async () => {
      const registered = [...this.providers.entries()];
      registered.forEach(([id]) => this.setOperation(id, 'restoring'));
      await Promise.all(
        registered.map(async ([id, provider]) => {
          try {
            const result = await provider.restoreSession();
            this.setConnection(id, restoreResultConnection(result));
          } catch (error: unknown) {
            this.setConnectionFromError(id, disconnectedConnection(), error);
          }
        }),
      );
      this.updateSnapshot({ ...this.snapshot, phase: 'ready' });
    });
  };

  signIn = (providerId: AuthProviderId): Promise<void> =>
    this.runExclusive(async () => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        this.setFailure(providerId, 'configuration');
        return;
      }
      const previous = this.snapshot.connections[providerId];
      this.setOperation(providerId, 'signing_in');
      try {
        const account = await provider.signIn();
        this.setConnection(providerId, {
          state: 'connected',
          account,
          operation: 'idle',
          failure: null,
          canRetry: false,
        });
      } catch (error: unknown) {
        this.setConnectionFromError(providerId, previous, error);
      }
    });

  retry = (providerId: AuthProviderId): Promise<void> =>
    this.runExclusive(async () => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        this.setFailure(providerId, 'configuration');
        return;
      }
      const previous = this.snapshot.connections[providerId];
      this.setOperation(providerId, 'restoring');
      try {
        const result = await provider.restoreSession();
        this.setConnection(providerId, restoreResultConnection(result));
      } catch (error: unknown) {
        this.setConnectionFromError(providerId, previous, error);
      }
    });

  signOut = (providerId: AuthProviderId): Promise<void> =>
    this.runExclusive(async () => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        this.setFailure(providerId, 'configuration');
        return;
      }
      const previous = this.snapshot.connections[providerId];
      this.setOperation(providerId, 'signing_out');
      try {
        await provider.signOut();
        this.setConnection(providerId, disconnectedConnection());
      } catch (error: unknown) {
        this.setConnectionFromError(providerId, previous, error);
      }
    });

  markReconnectRequired = (providerId: AuthProviderId): Promise<void> =>
    this.runExclusive(async () => {
      const provider = this.providers.get(providerId);
      if (!provider) {
        this.setFailure(providerId, 'configuration');
        return;
      }
      this.setOperation(providerId, 'signing_out');
      let failure: AuthFailureCode | null = null;
      try {
        await provider.signOut();
      } catch {
        failure = 'storage';
      }
      this.setConnection(providerId, {
        state: 'reconnect_required',
        account: null,
        operation: 'idle',
        failure,
        canRetry: false,
      });
    });

  private runExclusive(operation: () => Promise<void>): Promise<void> {
    if (this.activeOperation) return this.activeOperation;
    const active = operation().finally(() => {
      if (this.activeOperation === active) this.activeOperation = null;
    });
    this.activeOperation = active;
    return active;
  }

  private setConnectionFromError(
    providerId: AuthProviderId,
    previous: ProviderSessionSnapshot,
    error: unknown,
  ): void {
    const failure = safeFailure(error);
    if (failure.cancelled) {
      this.setConnection(providerId, {
        ...previous,
        operation: 'idle',
        failure: null,
        canRetry: false,
      });
      return;
    }
    if (failure.reconnectRequired) {
      this.setConnection(providerId, {
        state: 'reconnect_required',
        account: null,
        operation: 'idle',
        failure: failure.code,
        canRetry: false,
      });
      return;
    }
    this.setConnection(providerId, {
      ...previous,
      operation: 'idle',
      failure: failure.code,
      canRetry: failure.canRetry,
    });
  }

  private setFailure(
    providerId: AuthProviderId,
    failure: AuthFailureCode,
  ): void {
    const current = this.snapshot.connections[providerId];
    this.setConnection(providerId, {
      ...current,
      operation: 'idle',
      failure,
      canRetry: false,
    });
  }

  private setOperation(
    providerId: AuthProviderId,
    operation: AuthSessionOperation,
  ): void {
    const current = this.snapshot.connections[providerId];
    this.setConnection(providerId, {
      ...current,
      operation,
      failure: null,
      canRetry: false,
    });
  }

  private setConnection(
    providerId: AuthProviderId,
    connection: ProviderSessionSnapshot,
  ): void {
    this.updateSnapshot({
      ...this.snapshot,
      connections: {
        ...this.snapshot.connections,
        [providerId]: connection,
      },
    });
  }

  private updateSnapshot(snapshot: AuthSessionSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
