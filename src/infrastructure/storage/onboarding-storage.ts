import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_COMPLETED_KEY = 'purikuki:onboarding-completed:v1';

export interface OnboardingStorage {
  hasCompleted(): Promise<boolean>;
  markCompleted(): Promise<void>;
}

export const onboardingStorage: OnboardingStorage = {
  async hasCompleted() {
    return (await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY)) === 'true';
  },
  async markCompleted() {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
  },
};
