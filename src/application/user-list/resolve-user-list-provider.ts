import type { AuthSessionSnapshot } from '@/application/auth/auth-contracts';
import type { PrimaryListProviderSnapshot } from '@/application/user-list/primary-list-provider-contracts';
import { AUTH_PROVIDER_IDS } from '@/domain/models/auth';
import type { AuthProviderId, ConnectedAccount } from '@/domain/models/auth';

export type UserListProviderResolution =
  | { kind: 'guest' }
  | { kind: 'active'; provider: AuthProviderId; account: ConnectedAccount }
  | { kind: 'reconnect_required'; providers: readonly AuthProviderId[] }
  | { kind: 'primary_required'; candidates: readonly AuthProviderId[] }
  | { kind: 'loading' };

export function resolveUserListProvider(
  connections: AuthSessionSnapshot['connections'],
  primary: PrimaryListProviderSnapshot,
): UserListProviderResolution {
  const connected = AUTH_PROVIDER_IDS.filter(
    (provider) =>
      connections[provider].state === 'connected' &&
      connections[provider].account !== null,
  );
  const reconnecting = AUTH_PROVIDER_IDS.filter(
    (provider) => connections[provider].state === 'reconnect_required',
  );

  if (connected.length === 0 && reconnecting.length === 0) {
    return { kind: 'guest' };
  }
  if (connected.length === 0) {
    return { kind: 'reconnect_required', providers: reconnecting };
  }
  if (connected.length === 1) {
    const provider = connected[0]!;
    const account = connections[provider].account!;
    return { kind: 'active', provider, account };
  }

  if (primary.phase === 'loading') return { kind: 'loading' };
  if (primary.selected !== null && connected.includes(primary.selected)) {
    const account = connections[primary.selected].account!;
    return { kind: 'active', provider: primary.selected, account };
  }
  return { kind: 'primary_required', candidates: connected };
}
