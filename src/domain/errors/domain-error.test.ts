import { getUserSafeErrorMessage } from '@/domain/errors/domain-error';
import {
  AniListHttpError,
  AniListNetworkError,
  AniListRateLimitError,
  AniListResponseFormatError,
  AniListServiceUnavailableError,
  AniListTimeoutError,
} from '@/infrastructure/api/anilist/anilist-errors';

describe('user-safe infrastructure messages', () => {
  it.each([
    [
      new AniListNetworkError('Raw native network detail'),
      'Unable to reach the anime catalog. Check your connection and try again.',
    ],
    [
      new AniListTimeoutError('Raw timeout detail'),
      'The anime catalog took too long to respond. Please try again.',
    ],
    [
      new AniListRateLimitError(null, 'Raw rate-limit detail'),
      'The anime catalog is receiving too many requests. Please wait a moment and try again.',
    ],
    [
      new AniListServiceUnavailableError(504, 'BadResponseException'),
      'The anime catalog is temporarily unavailable.',
    ],
    [
      new AniListHttpError(400, 'Raw upstream error'),
      'The anime catalog could not complete the request. Please try again.',
    ],
    [
      new AniListResponseFormatError('Raw parser error'),
      'The anime catalog returned an unknown response format. Please try again.',
    ],
  ])('does not expose upstream detail for %s', (error, expected) => {
    expect(getUserSafeErrorMessage(error)).toBe(expected);
    expect(getUserSafeErrorMessage(error)).not.toBe(error.message);
  });
});
