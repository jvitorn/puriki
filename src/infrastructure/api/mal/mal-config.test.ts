import {
  DEFAULT_MAL_BASE_URL,
  isMalClientIdConfigured,
  normalizeMalBaseUrl,
} from '@/infrastructure/api/mal/mal-config';

describe('MAL configuration', () => {
  it('recognizes configured, missing, and whitespace-only Client IDs', () => {
    expect(isMalClientIdConfigured('injected-test-id')).toBe(true);
    expect(isMalClientIdConfigured('')).toBe(false);
    expect(isMalClientIdConfigured('   ')).toBe(false);
  });

  it('normalizes injectable base URLs without changing the official default', () => {
    expect(DEFAULT_MAL_BASE_URL).toBe('https://api.myanimelist.net/v2');
    expect(normalizeMalBaseUrl(' https://example.test/v2/// ')).toBe(
      'https://example.test/v2',
    );
  });
});
