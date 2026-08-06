import { includesNormalized, normalizeSearchText } from '@/shared/utils/search';

describe('search normalization', () => {
  it('normalizes case, spaces, and accents', () => {
    expect(normalizeSearchText('  Café   NÉBULA ')).toBe('cafe nebula');
  });

  it('matches normalized fragments', () => {
    expect(includesNormalized('Café Nebula', 'CAFE')).toBe(true);
    expect(includesNormalized('Moonlit Vanguard', 'ocean')).toBe(false);
  });
});
