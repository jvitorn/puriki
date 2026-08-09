import { getSynopsisTranslationTarget } from '@/application/translation/synopsis-language';

describe('getSynopsisTranslationTarget', () => {
  it.each([
    ['pt-BR', 'pt'],
    ['es', 'es'],
    ['en', null],
  ] as const)('maps %s to %s', (language, expected) => {
    expect(getSynopsisTranslationTarget(language)).toBe(expected);
  });
});
