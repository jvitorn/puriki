import PurikukiTranslationModule from '../../../modules/purikuki-translation';
import type { NativePurikukiTranslationModule } from '../../../modules/purikuki-translation';

import {
  SynopsisTranslationError,
  type SynopsisTranslationRequest,
  type SynopsisTranslationResult,
  type SynopsisTranslator,
} from '@/domain/services/synopsis-translator';

function nativeErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function mapNativeError(error: unknown): SynopsisTranslationError {
  const code = nativeErrorCode(error);
  if (code === 'ERR_EMPTY_TRANSLATION') {
    return new SynopsisTranslationError(
      'empty_translation',
      'The native translator returned an empty result.',
      { cause: error },
    );
  }
  if (code === 'ERR_MODEL_DOWNLOAD_FAILED') {
    return new SynopsisTranslationError(
      'model_download_failed',
      'The on-device translation model could not be downloaded.',
      { cause: error },
    );
  }
  if (
    code === 'ERR_UNSUPPORTED_LANGUAGE' ||
    code === 'ERR_SAME_LANGUAGE' ||
    code === 'ERR_EMPTY_TEXT'
  ) {
    return new SynopsisTranslationError(
      'unsupported_language',
      'The synopsis translation request is not supported.',
      { cause: error },
    );
  }
  return new SynopsisTranslationError(
    'translation_failed',
    'The on-device synopsis translation failed.',
    { cause: error },
  );
}

export class MlKitSynopsisTranslator implements SynopsisTranslator {
  constructor(
    private readonly nativeModule: NativePurikukiTranslationModule | null = PurikukiTranslationModule,
  ) {}

  isAvailable(): boolean {
    return this.nativeModule !== null;
  }

  async translate(
    request: SynopsisTranslationRequest,
  ): Promise<SynopsisTranslationResult> {
    if (!this.nativeModule) {
      throw new SynopsisTranslationError(
        'translator_unavailable',
        'The Purikuki native translation module is unavailable.',
      );
    }
    if (request.text.trim().length === 0) {
      throw new SynopsisTranslationError(
        'translation_failed',
        'The synopsis cannot be empty.',
      );
    }

    try {
      const result = await this.nativeModule.translateAsync({
        ...request,
        wifiOnly: true,
      });
      if (result.translatedText.trim().length === 0) {
        throw new SynopsisTranslationError(
          'empty_translation',
          'The native translator returned an empty result.',
        );
      }
      return result;
    } catch (error) {
      if (error instanceof SynopsisTranslationError) throw error;
      throw mapNativeError(error);
    }
  }
}
