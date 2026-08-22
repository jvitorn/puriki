import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PRIMARY_LIST_PROVIDER_KEY,
  primaryListProviderStorage,
} from '@/infrastructure/storage/primary-list-provider-storage';

describe('primaryListProviderStorage', () => {
  afterEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips a stored provider', async () => {
    await expect(primaryListProviderStorage.get()).resolves.toBeNull();
    await primaryListProviderStorage.set('mal');
    expect(await AsyncStorage.getItem(PRIMARY_LIST_PROVIDER_KEY)).toBe('mal');
    await expect(primaryListProviderStorage.get()).resolves.toBe('mal');
    await primaryListProviderStorage.clear();
    await expect(primaryListProviderStorage.get()).resolves.toBeNull();
  });

  it('treats an unknown stored value as null', async () => {
    await AsyncStorage.setItem(PRIMARY_LIST_PROVIDER_KEY, 'crunchyroll');
    await expect(primaryListProviderStorage.get()).resolves.toBeNull();
  });
});
