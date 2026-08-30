import type { AuthSessionSnapshot } from '@/application/auth/auth-contracts';
import type { PrimaryListProviderSnapshot } from '@/application/user-list/primary-list-provider-contracts';
import { resolveUserListProvider } from '@/application/user-list/resolve-user-list-provider';

export type UserListUpdateMode = 'queued' | 'direct' | 'unavailable';

export interface UserListAccess {
  scope: string;
  canMutate: boolean;
  updateMode: UserListUpdateMode;
}

export function resolveUserListAccess(
  snapshot: AuthSessionSnapshot,
  primary: PrimaryListProviderSnapshot,
): UserListAccess {
  const resolution = resolveUserListProvider(snapshot.connections, primary);
  switch (resolution.kind) {
    case 'guest':
      return { scope: 'guest', canMutate: true, updateMode: 'queued' };
    case 'active':
      return {
        scope: `${resolution.provider}:${resolution.account.userId}`,
        canMutate: true,
        updateMode: 'direct',
      };
    case 'reconnect_required':
      return {
        scope: `reconnect-required:${resolution.providers.join(',')}`,
        canMutate: false,
        updateMode: 'unavailable',
      };
    case 'primary_required':
      return {
        scope: 'primary-required',
        canMutate: false,
        updateMode: 'unavailable',
      };
    case 'loading':
      return {
        scope: 'primary-loading',
        canMutate: false,
        updateMode: 'unavailable',
      };
  }
}
