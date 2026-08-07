import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import {
  JikanHttpError,
  JikanNetworkError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';

describe('user-safe infrastructure messages', () => {
  it.each([
    [
      new JikanNetworkError('Raw native network detail'),
      'Unable to reach the anime catalog. Check your connection and try again.',
    ],
    [
      new JikanTimeoutError('Raw timeout detail'),
      'The anime catalog took too long to respond. Please try again.',
    ],
    [
      new JikanRateLimitError(null, 'Raw rate-limit detail'),
      'The anime catalog is receiving too many requests. Please wait a moment and try again.',
    ],
    [
      new JikanServiceUnavailableError(504, null, 'BadResponseException'),
      'The anime catalog is temporarily unavailable.',
    ],
    [
      new JikanHttpError(400, 'Raw upstream error'),
      'The anime catalog could not complete the request. Please try again.',
    ],
    [
      new JikanResponseFormatError('Raw parser error'),
      'The anime catalog returned an unknown response format. Please try again.',
    ],
  ])('does not expose upstream detail for %s', (error, expected) => {
    expect(getUserSafeErrorMessage(error)).toBe(expected);
    expect(getUserSafeErrorMessage(error)).not.toBe(error.message);
  });
});
