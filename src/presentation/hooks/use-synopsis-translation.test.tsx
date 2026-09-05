import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import type { SynopsisTranslationCache } from '@/domain/repositories/synopsis-translation-cache';
import {
  SynopsisTranslationError,
  type SynopsisTranslator,
} from '@/domain/services/synopsis-translator';
import type { AppLanguage } from '@/localization/languages';
import { useSynopsisTranslation } from '@/presentation/hooks/use-synopsis-translation';
import { SynopsisTranslationProvider } from '@/presentation/providers/synopsis-translation-provider';
import type { SynopsisTranslationDependencies } from '@/presentation/providers/synopsis-translation-provider';

const original = 'An English synopsis.';

function createDependencies(options?: {
  available?: boolean;
  translatedText?: string;
  cachedText?: string;
}): SynopsisTranslationDependencies & {
  translator: SynopsisTranslator & { translate: jest.Mock };
  cache: SynopsisTranslationCache & { get: jest.Mock; set: jest.Mock };
} {
  const translator = {
    isAvailable: () => options?.available ?? true,
    translate: jest.fn().mockResolvedValue({
      translatedText: options?.translatedText ?? 'Sinopse traduzida.',
    }),
  };
  const cache = {
    get: jest.fn().mockResolvedValue(
      options?.cachedText
        ? {
            version: 1,
            animeId: 1,
            sourceLanguage: 'en',
            targetLanguage: 'pt',
            sourceText: original,
            translatedText: options.cachedText,
            translatedAt: '2026-08-09T12:00:00.000Z',
          }
        : null,
    ),
    set: jest.fn().mockResolvedValue(undefined),
  };
  return { translator, cache };
}

async function renderTranslationHook(
  dependencies: SynopsisTranslationDependencies,
  appLanguage: AppLanguage = 'pt-BR',
) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <SynopsisTranslationProvider dependencies={dependencies}>
      {children}
    </SynopsisTranslationProvider>
  );
  return await renderHook(
    ({ language }: { language: AppLanguage }) =>
      useSynopsisTranslation({
        animeId: 1,
        synopsis: original,
        appLanguage: language,
      }),
    { initialProps: { language: appLanguage }, wrapper },
  );
}

describe('useSynopsisTranslation', () => {
  it('does not translate automatically', async () => {
    const dependencies = createDependencies();
    const { result } = await renderTranslationHook(dependencies);
    expect(result.current.displayedText).toBe(original);
    expect(dependencies.translator.translate).not.toHaveBeenCalled();
    expect(dependencies.cache.get).not.toHaveBeenCalled();
  });

  it('does not translate for an English interface', async () => {
    const dependencies = createDependencies();
    const { result } = await renderTranslationHook(dependencies, 'en');
    expect(result.current.canTranslate).toBe(false);
    await act(async () => result.current.translate());
    expect(dependencies.translator.translate).not.toHaveBeenCalled();
  });

  it.each([
    ['pt-BR', 'pt', 'Sinopse traduzida.'],
    ['es', 'es', 'Sinopsis traducida.'],
  ] as const)(
    'translates %s only after the user action',
    async (language, targetLanguage, translatedText) => {
      const dependencies = createDependencies({ translatedText });
      const { result } = await renderTranslationHook(dependencies, language);

      await act(async () => result.current.translate());

      expect(dependencies.translator.translate).toHaveBeenCalledWith({
        text: original,
        sourceLanguage: 'en',
        targetLanguage,
      });
      expect(result.current.displayedText).toBe(translatedText);
      expect(dependencies.cache.set).toHaveBeenCalledWith(
        expect.objectContaining({
          animeId: 1,
          sourceText: original,
          targetLanguage,
          translatedText,
        }),
      );
    },
  );

  it('protects a pending translation from repeated taps', async () => {
    let resolveTranslation:
      ((value: { translatedText: string }) => void) | null = null;
    const dependencies = createDependencies();
    dependencies.translator.translate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranslation = resolve;
        }),
    );
    const { result } = await renderTranslationHook(dependencies);

    let requests: Promise<void>[] = [];
    await act(() => {
      requests = [
        result.current.translate(),
        result.current.translate(),
        result.current.translate(),
      ];
    });
    await waitFor(() =>
      expect(dependencies.translator.translate).toHaveBeenCalledTimes(1),
    );
    await act(async () => {
      resolveTranslation?.({ translatedText: 'Uma tradução.' });
      await Promise.all(requests);
    });
  });

  it('uses a valid cache without invoking the native translator', async () => {
    const dependencies = createDependencies({
      cachedText: 'Primeira linha.<br>Segunda linha.',
    });
    const { result } = await renderTranslationHook(dependencies);
    await act(async () => result.current.translate());

    expect(result.current.displayedText).toBe('Primeira linha.\nSegunda linha.');
    expect(dependencies.translator.translate).not.toHaveBeenCalled();
  });

  it('normalizes line breaks returned by the translator', async () => {
    const dependencies = createDependencies({
      translatedText: 'Primeira linha.<br/>Segunda linha.',
    });
    const { result } = await renderTranslationHook(dependencies);

    await act(async () => result.current.translate());

    expect(result.current.displayedText).toBe('Primeira linha.\nSegunda linha.');
    expect(dependencies.cache.set).toHaveBeenCalledWith(
      expect.objectContaining({
        translatedText: 'Primeira linha.\nSegunda linha.',
      }),
    );
  });

  it('treats a stale cache miss as a native translation request', async () => {
    const dependencies = createDependencies();
    dependencies.cache.get.mockResolvedValueOnce(null);
    const { result } = await renderTranslationHook(dependencies);
    await act(async () => result.current.translate());
    expect(dependencies.translator.translate).toHaveBeenCalledTimes(1);
  });

  it('shows a successful result even when the cache write fails', async () => {
    const dependencies = createDependencies();
    dependencies.cache.set.mockRejectedValueOnce(new Error('disk full'));
    const { result } = await renderTranslationHook(dependencies);
    await act(async () => result.current.translate());
    expect(result.current.displayedText).toBe('Sinopse traduzida.');
  });

  it('preserves the original after failure and succeeds on retry', async () => {
    const dependencies = createDependencies();
    dependencies.translator.translate
      .mockRejectedValueOnce(
        new SynopsisTranslationError(
          'model_download_failed',
          'Wi-Fi is unavailable.',
        ),
      )
      .mockResolvedValueOnce({ translatedText: 'Tentativa concluída.' });
    const { result } = await renderTranslationHook(dependencies);

    await act(async () => result.current.translate());
    expect(result.current.displayedText).toBe(original);
    expect(result.current.error?.code).toBe('model_download_failed');

    await act(async () => result.current.retry());
    expect(result.current.displayedText).toBe('Tentativa concluída.');
    expect(result.current.error).toBeNull();
  });

  it('toggles the original and translated text without retranslating', async () => {
    const dependencies = createDependencies();
    const { result } = await renderTranslationHook(dependencies);
    await act(async () => result.current.translate());
    await act(() => result.current.showOriginal());
    expect(result.current.displayedText).toBe(original);
    await act(() => result.current.showTranslation());
    expect(result.current.displayedText).toBe('Sinopse traduzida.');
    expect(dependencies.translator.translate).toHaveBeenCalledTimes(1);
  });

  it('resets to original without translating when the language changes', async () => {
    const dependencies = createDependencies();
    const { result, rerender } = await renderTranslationHook(dependencies);
    await act(async () => result.current.translate());

    await rerender({ language: 'es' });
    await waitFor(() => expect(result.current.displayedText).toBe(original));
    expect(dependencies.translator.translate).toHaveBeenCalledTimes(1);
  });

  it('ignores a result that resolves after the target language changes', async () => {
    let resolveTranslation:
      ((value: { translatedText: string }) => void) | null = null;
    const dependencies = createDependencies();
    dependencies.translator.translate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveTranslation = resolve;
        }),
    );
    const { result, rerender } = await renderTranslationHook(dependencies);
    let pendingRequest: Promise<void> | null = null;
    await act(() => {
      pendingRequest = result.current.translate();
    });
    await waitFor(() => expect(result.current.isTranslating).toBe(true));

    await rerender({ language: 'es' });
    await act(async () => {
      resolveTranslation?.({ translatedText: 'Tradução portuguesa tardia.' });
      await pendingRequest;
    });

    expect(result.current.displayedText).toBe(original);
    expect(dependencies.cache.set).not.toHaveBeenCalled();
  });

  it('reports an unavailable translator without crashing', async () => {
    const dependencies = createDependencies({ available: false });
    const { result } = await renderTranslationHook(dependencies);
    expect(result.current.canTranslate).toBe(false);
    expect(result.current.displayedText).toBe(original);
  });
});
