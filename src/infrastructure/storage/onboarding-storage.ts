import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OnboardingStore } from '@/application/runtime/application-runtime';

export const ONBOARDING_COMPLETED_KEY = 'purikuki:onboarding-completed:v1';

export const onboardingStorage: OnboardingStore = {
  async hasCompleted() {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
  },
  async markCompleted() {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  },
};
