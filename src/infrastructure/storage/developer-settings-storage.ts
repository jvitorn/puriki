import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEVELOPER_TOOLS_ENABLED_KEY =
  'purikuki:developer-tools-enabled:v1';

export interface DeveloperSettingsStorage {
  getDeveloperToolsEnabled(): Promise<boolean>;
  setDeveloperToolsEnabled(enabled: boolean): Promise<void>;
}

export const developerSettingsStorage: DeveloperSettingsStorage = {
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
