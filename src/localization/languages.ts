export const APP_LANGUAGES = ['en', 'pt-BR', 'es'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];
export type LanguagePreference = AppLanguage | 'system';

export function normalizeAppLanguage(languageTag?: string | null): AppLanguage {
  const normalized = languageTag?.toLowerCase();
  if (normalized?.startsWith('pt')) return 'pt-BR';
  if (normalized?.startsWith('es')) return 'es';
  return 'en';
}

export function resolveEffectiveLanguage(
  preference: LanguagePreference,
  systemLanguageTag?: string | null,
): AppLanguage {
  return preference === 'system'
    ? normalizeAppLanguage(systemLanguageTag)
    : preference;
}

export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return value === 'system' || APP_LANGUAGES.includes(value as AppLanguage);
}
