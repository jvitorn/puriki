import type {
  SynopsisSourceLanguage,
  SynopsisTargetLanguage,
} from '@/domain/services/synopsis-translator';

export interface SynopsisTranslationCacheLookup {
  animeId: number;
  sourceLanguage: SynopsisSourceLanguage;
  targetLanguage: SynopsisTargetLanguage;
  sourceText: string;
}

export interface CachedSynopsisTranslation extends SynopsisTranslationCacheLookup {
  version: 1;
  translatedText: string;
  translatedAt: string;
}

export interface SynopsisTranslationCache {
  get(
    lookup: SynopsisTranslationCacheLookup,
  ): Promise<CachedSynopsisTranslation | null>;
  set(translation: CachedSynopsisTranslation): Promise<void>;
}
