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
      'Unable to reach Jikan. Check your connection and try again.',
    ],
    [
      new JikanTimeoutError('Raw timeout detail'),
      'Jikan took too long to respond. Please try again.',
    ],
    [
      new JikanRateLimitError(null, 'Raw rate-limit detail'),
      'Jikan is receiving too many requests. Please wait a moment and try again.',
    ],
    [
      new JikanServiceUnavailableError(504, null, 'BadResponseException'),
      'Jikan is temporarily unavailable. Please try again shortly.',
    ],
    [
      new JikanHttpError(400, 'Raw upstream error'),
      'Jikan could not complete the request. Please try again.',
    ],
    [
      new JikanResponseFormatError('Raw parser error'),
      'Jikan returned an unknown response format. Please try again.',
    ],
  ])('does not expose upstream detail for %s', (error, expected) => {
    expect(getUserSafeErrorMessage(error)).toBe(expected);
    expect(getUserSafeErrorMessage(error)).not.toBe(error.message);
  });
});
