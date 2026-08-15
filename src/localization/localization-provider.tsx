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
import { resolveEffectiveLanguage } from '@/localization/languages';
import type { AppLanguage, LanguagePreference } from '@/localization/languages';
import { colors } from '@/presentation/theme/tokens';

interface LocalizationContextValue {
  language: AppLanguage;
  preference: LanguagePreference;
  isChangingLanguage: boolean;
  setPreference(preference: LanguagePreference): Promise<void>;
}

interface LocalizationState {
  language: AppLanguage;
  preference: LanguagePreference;
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
  const [state, setState] = useState<LocalizationState | null>(() =>
    initialPreference
      ? {
          preference: initialPreference,
          language: resolveEffectiveLanguage(
            initialPreference,
            getSystemLanguageTag(),
          ),
        }
      : null,
  );
  const [isChangingLanguage, setIsChangingLanguage] = useState(false);

  const applyPreference = useCallback(
    async (next: LanguagePreference, persist: boolean) => {
      const nextLanguage = resolveEffectiveLanguage(
        next,
        getSystemLanguageTag(),
      );
      setIsChangingLanguage(true);
      try {
        await appI18n.changeLanguage(nextLanguage);
        setState({ preference: next, language: nextLanguage });
        if (persist) {
          void storage.set(next).catch(() => {
            // The visible in-memory choice remains authoritative this session.
          });
        }
      } catch {
        // Bundled resources should make this exceptional; retain the prior UI.
      } finally {
        setIsChangingLanguage(false);
      }
    },
    [getSystemLanguageTag, storage],
  );

  useEffect(() => {
    if (initialPreference || state) return;
    let active = true;
    void storage
      .get()
      .then((stored) => {
        if (active) void applyPreference(stored, false);
      })
      .catch(() => {
        if (active) void applyPreference('system', false);
      });
    return () => {
      active = false;
    };
  }, [applyPreference, initialPreference, state, storage]);

  useEffect(
    () =>
      AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active' && state?.preference === 'system')
          void applyPreference('system', false);
      }).remove,
    [applyPreference, state?.preference],
  );

  const value = useMemo<LocalizationContextValue | null>(
    () =>
      state
        ? {
            ...state,
            isChangingLanguage,
            setPreference: (next) => applyPreference(next, true),
          }
        : null,
    [applyPreference, isChangingLanguage, state],
  );

  if (!value) {
    return (
      <View
        testID="localization-loading"
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.primaryEmphasis} />
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
