import { getLocales } from 'expo-localization';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ActivityIndicator, AppState, View } from 'react-native';

import { appI18n } from '@/localization/i18n';
import { languagePreferenceStorage } from '@/localization/language-storage';
import type { LanguagePreferenceStorage } from '@/localization/language-storage';
import {
  normalizeAppLanguage,
  resolveEffectiveLanguage,
} from '@/localization/languages';
import type { AppLanguage, LanguagePreference } from '@/localization/languages';
import { colors } from '@/presentation/theme/tokens';

interface LocalizationContextValue {
  language: AppLanguage;
  preference: LanguagePreference;
  setPreference(preference: LanguagePreference): Promise<void>;
}

interface LocalizationProviderProps extends PropsWithChildren {
  initialPreference?: LanguagePreference;
  storage?: LanguagePreferenceStorage;
  getSystemLanguageTag?: () => string | null;
}

const LocalizationContext = createContext<LocalizationContextValue | null>(
  null,
);

function defaultSystemLanguageTag(): string | null {
  return getLocales()[0]?.languageTag ?? null;
}

export function LocalizationProvider({
  children,
  initialPreference,
  storage = languagePreferenceStorage,
  getSystemLanguageTag = defaultSystemLanguageTag,
}: LocalizationProviderProps) {
  const [preference, setPreferenceState] = useState<LanguagePreference | null>(
    initialPreference ?? null,
  );
  const [language, setLanguage] = useState<AppLanguage>(() =>
    initialPreference && initialPreference !== 'system'
      ? initialPreference
      : normalizeAppLanguage(getSystemLanguageTag()),
  );

  const applyPreference = useCallback(
    async (next: LanguagePreference) => {
      const nextLanguage = resolveEffectiveLanguage(
        next,
        getSystemLanguageTag(),
      );
      setPreferenceState(next);
      setLanguage(nextLanguage);
      await appI18n.changeLanguage(nextLanguage);
    },
    [getSystemLanguageTag],
  );

  useEffect(() => {
    if (initialPreference) return;
    let active = true;
    void storage
      .get()
      .then((stored) => {
        if (active) void applyPreference(stored);
      })
      .catch(() => {
        if (active) void applyPreference('system');
      });
    return () => {
      active = false;
    };
  }, [applyPreference, initialPreference, storage]);

  useEffect(
    () =>
      AppState.addEventListener('change', (state) => {
        if (state === 'active' && preference === 'system')
          void applyPreference('system');
      }).remove,
    [applyPreference, preference],
  );

  const value = useMemo<LocalizationContextValue | null>(
    () =>
      preference
        ? {
            language,
            preference,
            setPreference: async (next) => {
              await applyPreference(next);
              try {
                await storage.set(next);
              } catch {
                // Keep the immediate in-memory choice when persistence is unavailable.
              }
            },
          }
        : null,
    [applyPreference, language, preference, storage],
  );

  if (!value) {
    return (
      <View
        testID="localization-loading"
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <I18nextProvider i18n={appI18n}>
      <LocalizationContext.Provider value={value}>
        {children}
      </LocalizationContext.Provider>
    </I18nextProvider>
  );
}

export function useAppLanguage(): LocalizationContextValue {
  const value = useContext(LocalizationContext);
  if (!value)
    throw new Error('useAppLanguage must be used inside LocalizationProvider.');
  return value;
}
