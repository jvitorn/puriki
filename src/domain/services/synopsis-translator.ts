export type SynopsisSourceLanguage = 'en';
export type SynopsisTargetLanguage = 'pt' | 'es';

export interface SynopsisTranslationRequest {
  text: string;
  sourceLanguage: SynopsisSourceLanguage;
  targetLanguage: SynopsisTargetLanguage;
}

export interface SynopsisTranslationResult {
  translatedText: string;
}

export interface SynopsisTranslator {
  isAvailable(): boolean;
  translate(
    request: SynopsisTranslationRequest,
  ): Promise<SynopsisTranslationResult>;
}

export type SynopsisTranslationErrorCode =
  | 'translator_unavailable'
  | 'unsupported_language'
  | 'model_download_failed'
  | 'translation_failed'
  | 'empty_translation';

export class SynopsisTranslationError extends Error {
  constructor(
    readonly code: SynopsisTranslationErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SynopsisTranslationError';
  }
}

export function asSynopsisTranslationError(
  error: unknown,
): SynopsisTranslationError {
  return error instanceof SynopsisTranslationError
    ? error
    : new SynopsisTranslationError(
        'translation_failed',
        'Synopsis translation failed.',
        { cause: error },
      );
}
