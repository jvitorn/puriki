import type { SynopsisTargetLanguage } from '@/domain/services/synopsis-translator';
import type { AppLanguage } from '@/localization/languages';

export function getSynopsisTranslationTarget(
  language: AppLanguage,
): SynopsisTargetLanguage | null {
  if (language === 'pt-BR') return 'pt';
  if (language === 'es') return 'es';
  return null;
}
