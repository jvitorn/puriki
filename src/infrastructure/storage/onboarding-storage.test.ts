import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  ONBOARDING_COMPLETED_KEY,
  onboardingStorage,
} from '@/infrastructure/storage/onboarding-storage';

describe('onboardingStorage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('treats absent and unexpected values as not completed', async () => {
    await expect(onboardingStorage.hasCompleted()).resolves.toBe(false);

    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'yes');

    await expect(onboardingStorage.hasCompleted()).resolves.toBe(false);
  });

  it('reads and writes onboarding completion using the versioned key', async () => {
    await onboardingStorage.markCompleted();

    await expect(
      AsyncStorage.getItem('purikuki:onboarding-completed:v1'),
    ).resolves.toBe('true');
    await expect(onboardingStorage.hasCompleted()).resolves.toBe(true);
  });
});
