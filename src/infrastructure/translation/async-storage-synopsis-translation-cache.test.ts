import {
  AsyncStorageSynopsisTranslationCache,
  synopsisTranslationCacheKey,
} from '@/infrastructure/translation/async-storage-synopsis-translation-cache';

function createStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
  };
}

const lookup = {
  animeId: 52991,
  sourceLanguage: 'en' as const,
  targetLanguage: 'pt' as const,
  sourceText: 'An English synopsis.',
};

const validTranslation = {
  ...lookup,
  version: 1 as const,
  translatedText: 'Uma sinopse em português.',
  translatedAt: '2026-08-09T12:00:00.000Z',
};

describe('AsyncStorageSynopsisTranslationCache', () => {
  it('returns null for a cache miss', async () => {
    const cache = new AsyncStorageSynopsisTranslationCache(createStorage());
    await expect(cache.get(lookup)).resolves.toBeNull();
  });

  it('writes and returns a valid cached translation', async () => {
    const storage = createStorage();
    const cache = new AsyncStorageSynopsisTranslationCache(storage);
    await cache.set(validTranslation);

    await expect(cache.get(lookup)).resolves.toEqual(validTranslation);
    expect(storage.setItem).toHaveBeenCalledWith(
      synopsisTranslationCacheKey(52991, 'pt'),
      JSON.stringify(validTranslation),
    );
  });

  it('keeps Portuguese and Spanish entries isolated', async () => {
    const storage = createStorage();
    const cache = new AsyncStorageSynopsisTranslationCache(storage);
    const spanish = {
      ...validTranslation,
      targetLanguage: 'es' as const,
      translatedText: 'Una sinopsis en español.',
    };
    await cache.set(validTranslation);
    await cache.set(spanish);

    await expect(cache.get(lookup)).resolves.toEqual(validTranslation);
    await expect(
      cache.get({ ...lookup, targetLanguage: 'es' }),
    ).resolves.toEqual(spanish);
  });

  it('invalidates a changed provider synopsis', async () => {
    const storage = createStorage();
    const cache = new AsyncStorageSynopsisTranslationCache(storage);
    await cache.set(validTranslation);

    await expect(
      cache.get({ ...lookup, sourceText: 'The provider changed this text.' }),
    ).resolves.toBeNull();
  });

  it.each([
    ['malformed JSON', '{nope'],
    ['wrong version', JSON.stringify({ ...validTranslation, version: 2 })],
    [
      'empty translation',
      JSON.stringify({ ...validTranslation, translatedText: '   ' }),
    ],
    [
      'missing source text',
      JSON.stringify(
        Object.fromEntries(
          Object.entries(validTranslation).filter(
            ([key]) => key !== 'sourceText',
          ),
        ),
      ),
    ],
    [
      'wrong language',
      JSON.stringify({ ...validTranslation, targetLanguage: 'es' }),
    ],
  ])('ignores and removes %s', async (_, stored) => {
    const storage = createStorage();
    const key = synopsisTranslationCacheKey(lookup.animeId, 'pt');
    storage.values.set(key, stored);
    const cache = new AsyncStorageSynopsisTranslationCache(storage);

    await expect(cache.get(lookup)).resolves.toBeNull();
    expect(storage.removeItem).toHaveBeenCalledWith(key);
  });

  it('treats a storage read failure as a cache miss', async () => {
    const storage = createStorage();
    storage.getItem.mockRejectedValueOnce(new Error('storage unavailable'));
    const cache = new AsyncStorageSynopsisTranslationCache(storage);
    await expect(cache.get(lookup)).resolves.toBeNull();
  });

  it('reports a storage write failure to the caller', async () => {
    const storage = createStorage();
    storage.setItem.mockRejectedValueOnce(new Error('disk full'));
    const cache = new AsyncStorageSynopsisTranslationCache(storage);
    await expect(cache.set(validTranslation)).rejects.toThrow('disk full');
  });
});
