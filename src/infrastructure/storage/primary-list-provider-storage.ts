import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PrimaryListProviderStore } from '@/application/user-list/primary-list-provider-contracts';
import { AUTH_PROVIDER_IDS } from '@/domain/models/auth';
import type { AuthProviderId } from '@/domain/models/auth';

export const PRIMARY_LIST_PROVIDER_KEY = 'purikuki:primary-list-provider:v1';

function isAuthProviderId(value: string): value is AuthProviderId {
  return (AUTH_PROVIDER_IDS as readonly string[]).includes(value);
}

export const primaryListProviderStorage: PrimaryListProviderStore = {
  async get() {
    const stored = await AsyncStorage.getItem(PRIMARY_LIST_PROVIDER_KEY);
    return stored !== null && isAuthProviderId(stored) ? stored : null;
  },
  async set(provider) {
    await AsyncStorage.setItem(PRIMARY_LIST_PROVIDER_KEY, provider);
  },
  async clear() {
    await AsyncStorage.removeItem(PRIMARY_LIST_PROVIDER_KEY);
  },
};
