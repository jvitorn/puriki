import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import type { LanguagePreferenceStorage } from '@/localization/language-storage';
import {
  LocalizationProvider,
  useAppLanguage,
} from '@/localization/localization-provider';
import { Text } from '@/presentation/components/ui/text';

function LanguageProbe() {
  const { language } = useAppLanguage();
  return <Text>{language}</Text>;
}

describe('LocalizationProvider', () => {
  it('uses the stored system preference and refreshes locale on app activation', async () => {
    let systemTag = 'pt-BR';
    let appStateListener: ((state: string) => void) | undefined;
    const storage: LanguagePreferenceStorage = {
      get: jest.fn().mockResolvedValue('system'),
      set: jest.fn().mockResolvedValue(undefined),
    };
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_, listener) => {
        appStateListener = listener as (state: string) => void;
        return { remove: jest.fn() };
      });
    render(
      <LocalizationProvider
        storage={storage}
        getSystemLanguageTag={() => systemTag}
      >
        <LanguageProbe />
      </LocalizationProvider>,
    );
    await waitFor(() => expect(screen.getByText('pt-BR')).toBeVisible());
    systemTag = 'es-MX';
    await act(async () => appStateListener?.('active'));
    await waitFor(() => expect(screen.getByText('es')).toBeVisible());
  });
});
