export interface NativeTranslationRequest {
  text: string;
  sourceLanguage: 'en';
  targetLanguage: 'pt' | 'es';
  wifiOnly: boolean;
}

export interface NativeTranslationResult {
  translatedText: string;
}
