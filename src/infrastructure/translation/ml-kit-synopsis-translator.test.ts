import type { NativePurikukiTranslationModule } from '../../../modules/purikuki-translation';

import { MlKitSynopsisTranslator } from '@/infrastructure/translation/ml-kit-synopsis-translator';

function nativeModule(
  implementation: NativePurikukiTranslationModule['translateAsync'] = jest
    .fn()
    .mockResolvedValue({ translatedText: 'Sinopse traduzida.' }),
): NativePurikukiTranslationModule {
  return { translateAsync: implementation } as NativePurikukiTranslationModule;
}

describe('MlKitSynopsisTranslator', () => {
  it('reports optional-module availability', () => {
    expect(new MlKitSynopsisTranslator(null).isAvailable()).toBe(false);
    expect(new MlKitSynopsisTranslator(nativeModule()).isAvailable()).toBe(
      true,
    );
  });

  it('allows the native model download on any connection', async () => {
    const translateAsync = jest
      .fn()
      .mockResolvedValue({ translatedText: 'Sinopsis traducida.' });
    const translator = new MlKitSynopsisTranslator(
      nativeModule(translateAsync),
    );

    await expect(
      translator.translate({
        text: 'An English synopsis.',
        sourceLanguage: 'en',
        targetLanguage: 'es',
      }),
    ).resolves.toEqual({ translatedText: 'Sinopsis traducida.' });
    expect(translateAsync).toHaveBeenCalledWith({
      text: 'An English synopsis.',
      sourceLanguage: 'en',
      targetLanguage: 'es',
      wifiOnly: false,
    });
  });

  it.each([
    ['ERR_MODEL_DOWNLOAD_FAILED', 'model_download_failed'],
    ['ERR_UNSUPPORTED_LANGUAGE', 'unsupported_language'],
    ['ERR_EMPTY_TRANSLATION', 'empty_translation'],
    ['ERR_TRANSLATION_FAILED', 'translation_failed'],
  ])('maps native %s to %s', async (nativeCode, expectedCode) => {
    const error = Object.assign(new Error('native failure'), {
      code: nativeCode,
    });
    const translator = new MlKitSynopsisTranslator(
      nativeModule(jest.fn().mockRejectedValue(error)),
      { isDevelopment: false },
    );

    await expect(
      translator.translate({
        text: 'An English synopsis.',
        sourceLanguage: 'en',
        targetLanguage: 'pt',
      }),
    ).rejects.toMatchObject({ code: expectedCode, cause: error });
  });

  it('logs safe development diagnostics without synopsis text', async () => {
    const diagnosticLogger = jest.fn();
    const error = Object.assign(new Error('download failed'), {
      code: 'ERR_MODEL_DOWNLOAD_FAILED',
    });
    const translator = new MlKitSynopsisTranslator(
      nativeModule(jest.fn().mockRejectedValue(error)),
      { isDevelopment: true, diagnosticLogger },
    );

    await expect(
      translator.translate({
        text: 'Sensitive synopsis contents.',
        sourceLanguage: 'en',
        targetLanguage: 'pt',
      }),
    ).rejects.toMatchObject({ code: 'model_download_failed' });
    expect(diagnosticLogger).toHaveBeenCalledWith({
      code: 'model_download_failed',
      sourceLanguage: 'en',
      targetLanguage: 'pt',
    });
    expect(JSON.stringify(diagnosticLogger.mock.calls)).not.toContain(
      'Sensitive synopsis contents.',
    );
  });
});
