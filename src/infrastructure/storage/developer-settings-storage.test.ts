import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEVELOPER_TOOLS_ENABLED_KEY,
  developerSettingsStorage,
} from '@/infrastructure/storage/developer-settings-storage';

describe('developerSettingsStorage', () => {
  it('persists and restores the developer tools preference', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce('true');

    await expect(
      developerSettingsStorage.getDeveloperToolsEnabled(),
    ).resolves.toBe(true);
    await developerSettingsStorage.setDeveloperToolsEnabled(false);

    expect(AsyncStorage.getItem).toHaveBeenCalledWith(
      DEVELOPER_TOOLS_ENABLED_KEY,
    );
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      DEVELOPER_TOOLS_ENABLED_KEY,
      'false',
    );
  });

  it('treats missing and unexpected values as disabled', async () => {
    jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce(null);
    await expect(
      developerSettingsStorage.getDeveloperToolsEnabled(),
    ).resolves.toBe(false);
  });
});
