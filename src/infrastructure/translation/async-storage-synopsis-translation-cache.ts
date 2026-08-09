import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  CachedSynopsisTranslation,
  SynopsisTranslationCache,
  SynopsisTranslationCacheLookup,
} from '@/domain/repositories/synopsis-translation-cache';

interface TranslationStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

const CACHE_KEY_PREFIX = 'purikuki:synopsis-translation:v1';

export function synopsisTranslationCacheKey(
  animeId: number,
  targetLanguage: SynopsisTranslationCacheLookup['targetLanguage'],
): string {
  return `${CACHE_KEY_PREFIX}:${animeId}:${targetLanguage}`;
}

function isValidCachedTranslation(
  value: unknown,
  lookup: SynopsisTranslationCacheLookup,
): value is CachedSynopsisTranslation {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CachedSynopsisTranslation>;
  return (
    candidate.version === 1 &&
    candidate.animeId === lookup.animeId &&
    candidate.sourceLanguage === lookup.sourceLanguage &&
    candidate.targetLanguage === lookup.targetLanguage &&
    candidate.sourceText === lookup.sourceText &&
    typeof candidate.translatedText === 'string' &&
    candidate.translatedText.trim().length > 0 &&
    typeof candidate.translatedAt === 'string' &&
    candidate.translatedAt.trim().length > 0
  );
}

export class AsyncStorageSynopsisTranslationCache implements SynopsisTranslationCache {
  constructor(private readonly storage: TranslationStorage = AsyncStorage) {}

  async get(
    lookup: SynopsisTranslationCacheLookup,
  ): Promise<CachedSynopsisTranslation | null> {
    const key = synopsisTranslationCacheKey(
      lookup.animeId,
      lookup.targetLanguage,
    );
    let stored: string | null;
    try {
      stored = await this.storage.getItem(key);
    } catch {
      return null;
    }
    if (stored === null) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      await this.removeInvalidEntry(key);
      return null;
    }

    if (!isValidCachedTranslation(parsed, lookup)) {
      await this.removeInvalidEntry(key);
      return null;
    }
    return parsed;
  }

  async set(translation: CachedSynopsisTranslation): Promise<void> {
    await this.storage.setItem(
      synopsisTranslationCacheKey(
        translation.animeId,
        translation.targetLanguage,
      ),
      JSON.stringify(translation),
    );
  }

  private async removeInvalidEntry(key: string): Promise<void> {
    try {
      await this.storage.removeItem(key);
    } catch {
      // Invalid cache data is already ignored when cleanup is unavailable.
    }
  }
}
