import AsyncStorage from '@react-native-async-storage/async-storage';

import { appI18n, translationResources } from '@/localization/i18n';
import {
  LANGUAGE_PREFERENCE_KEY,
  languagePreferenceStorage,
} from '@/localization/language-storage';
import {
  isLanguagePreference,
  normalizeAppLanguage,
  resolveEffectiveLanguage,
} from '@/localization/languages';

describe('localization resources', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('en');
    await AsyncStorage.clear();
  });

  it('keeps identical non-empty keys in every language', () => {
    const englishKeys = Object.keys(translationResources.en).sort();
    for (const resource of [
      translationResources['pt-BR'],
      translationResources.es,
    ]) {
      expect(Object.keys(resource).sort()).toEqual(englishKeys);
      expect(
        Object.values(resource).every((value) => value.trim().length > 0),
      ).toBe(true);
    }
  });

  it('provides plural forms for representative counters', async () => {
    await appI18n.changeLanguage('en');
    expect(appI18n.t('search.results', { count: 1 })).toBe('1 result');
    expect(appI18n.t('search.results', { count: 2 })).toBe('2 results');
    await appI18n.changeLanguage('pt-BR');
    expect(appI18n.t('search.results', { count: 1 })).toBe('1 resultado');
    expect(appI18n.t('search.results', { count: 2 })).toBe('2 resultados');
    await appI18n.changeLanguage('es');
    expect(appI18n.t('common.episodes', { count: 1 })).toBe('1 episodio');
    expect(appI18n.t('common.episodes', { count: 3 })).toBe('3 episodios');
  });

  it('normalizes supported system locales and safely falls back to English', () => {
    expect(normalizeAppLanguage('pt-PT')).toBe('pt-BR');
    expect(normalizeAppLanguage('es-MX')).toBe('es');
    expect(normalizeAppLanguage('fr-FR')).toBe('en');
    expect(isLanguagePreference('system')).toBe(true);
    expect(isLanguagePreference('de')).toBe(false);
    expect(resolveEffectiveLanguage('pt-BR', 'es-MX')).toBe('pt-BR');
    expect(resolveEffectiveLanguage('system', 'es-MX')).toBe('es');
    expect(resolveEffectiveLanguage('system', 'ja-JP')).toBe('en');
  });

  it('persists and restores the manual preference', async () => {
    await languagePreferenceStorage.set('pt-BR');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      LANGUAGE_PREFERENCE_KEY,
      'pt-BR',
    );
    await expect(languagePreferenceStorage.get()).resolves.toBe('pt-BR');
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, 'unsupported');
    await expect(languagePreferenceStorage.get()).resolves.toBe('system');
  });
});
