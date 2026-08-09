import AsyncStorage from '@react-native-async-storage/async-storage';

import { isLanguagePreference } from '@/localization/languages';
import type { LanguagePreference } from '@/localization/languages';

export const LANGUAGE_PREFERENCE_KEY = 'purikuki:language-preference:v1';

export interface LanguagePreferenceStorage {
  get(): Promise<LanguagePreference>;
  set(preference: LanguagePreference): Promise<void>;
}

export const languagePreferenceStorage: LanguagePreferenceStorage = {
  async get() {
    const stored = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    return isLanguagePreference(stored) ? stored : 'system';
  },
  async set(preference) {
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, preference);
  },
};
