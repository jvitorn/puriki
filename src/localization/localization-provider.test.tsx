import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AppState, Pressable } from 'react-native';

import { appI18n } from '@/localization/i18n';
import type { LanguagePreferenceStorage } from '@/localization/language-storage';
import {
  LocalizationProvider,
  useAppLanguage,
} from '@/localization/localization-provider';
import { Text } from '@/presentation/components/ui/text';

function LanguageProbe() {
  const { isChangingLanguage, language, preference, setPreference } =
    useAppLanguage();
  return (
    <>
      <Text>{language}</Text>
      <Text testID="language-state">
        {preference}:{language}:{isChangingLanguage ? 'changing' : 'ready'}
      </Text>
      <Pressable onPress={() => void setPreference('pt-BR')}>
        <Text>Choose Portuguese</Text>
      </Pressable>
    </>
  );
}

describe('LocalizationProvider', () => {
  afterEach(() => jest.restoreAllMocks());

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
    await render(
      <LocalizationProvider
        storage={storage}
        getSystemLanguageTag={() => systemTag}
      >
        <LanguageProbe />
      </LocalizationProvider>,
    );
    await waitFor(() => expect(screen.getByText('pt-BR')).toBeVisible());
    systemTag = 'es-MX';
    await act(async () => {
      appStateListener?.('active');
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('es')).toBeVisible());
  });

  it('keeps startup loading scoped to preference initialization', async () => {
    const storage: LanguagePreferenceStorage = {
      get: jest.fn(() => new Promise(() => undefined)),
      set: jest.fn().mockResolvedValue(undefined),
    };
    await render(
      <LocalizationProvider storage={storage}>
        <LanguageProbe />
      </LocalizationProvider>,
    );

    expect(screen.getByTestId('localization-loading')).toBeVisible();
    expect(screen.queryByText('Choose Portuguese')).not.toBeOnTheScreen();
  });

  it('commits language and preference together before storage finishes', async () => {
    const storage: LanguagePreferenceStorage = {
      get: jest.fn().mockResolvedValue('en'),
      set: jest.fn(() => new Promise(() => undefined)),
    };
    await render(
      <LocalizationProvider initialPreference="en" storage={storage}>
        <LanguageProbe />
      </LocalizationProvider>,
    );

    await fireEvent.press(screen.getByText('Choose Portuguese'));

    await waitFor(() =>
      expect(screen.getByTestId('language-state')).toHaveTextContent(
        'pt-BR:pt-BR:ready',
      ),
    );
    expect(screen.queryByTestId('localization-loading')).not.toBeOnTheScreen();
    expect(storage.set).toHaveBeenCalledWith('pt-BR');
  });

  it('keeps the in-memory selection when persistence fails', async () => {
    const storage: LanguagePreferenceStorage = {
      get: jest.fn().mockResolvedValue('en'),
      set: jest.fn().mockRejectedValue(new Error('storage unavailable')),
    };
    await render(
      <LocalizationProvider initialPreference="en" storage={storage}>
        <LanguageProbe />
      </LocalizationProvider>,
    );

    await fireEvent.press(screen.getByText('Choose Portuguese'));

    await waitFor(() =>
      expect(screen.getByTestId('language-state')).toHaveTextContent(
        'pt-BR:pt-BR:ready',
      ),
    );
  });

  it('exposes a coherent pending state while i18n applies the new language', async () => {
    const originalChangeLanguage = appI18n.changeLanguage.bind(appI18n);
    let releaseChange: (() => void) | undefined;
    const changeLanguage = jest
      .spyOn(appI18n, 'changeLanguage')
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseChange = () => resolve(appI18n.t);
          }),
      );
    await render(
      <LocalizationProvider initialPreference="en">
        <LanguageProbe />
      </LocalizationProvider>,
    );

    await fireEvent.press(screen.getByText('Choose Portuguese'));
    expect(screen.getByTestId('language-state')).toHaveTextContent(
      'en:en:changing',
    );
    await act(async () => releaseChange?.());
    await waitFor(() =>
      expect(screen.getByTestId('language-state')).toHaveTextContent(
        'pt-BR:pt-BR:ready',
      ),
    );
    changeLanguage.mockRestore();
    await originalChangeLanguage('en');
  });
});
