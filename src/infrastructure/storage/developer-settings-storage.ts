import AsyncStorage from '@react-native-async-storage/async-storage';

import type { DeveloperSettingsStore } from '@/application/runtime/application-runtime';

export const DEVELOPER_TOOLS_ENABLED_KEY =
  'purikuki:developer-tools-enabled:v1';

export const developerSettingsStorage: DeveloperSettingsStore = {
  async getDeveloperToolsEnabled() {
    return (await AsyncStorage.getItem(DEVELOPER_TOOLS_ENABLED_KEY)) === 'true';
  },
  async setDeveloperToolsEnabled(enabled) {
    await AsyncStorage.setItem(
      DEVELOPER_TOOLS_ENABLED_KEY,
      enabled ? 'true' : 'false',
    );
  },
};
