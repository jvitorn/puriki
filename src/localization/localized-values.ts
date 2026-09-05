import type { TFunction } from 'i18next';

import type { AuthFailureCode } from '@/application/auth/auth-contracts';
import { DataSourceError } from '@/domain/errors/domain-error';
import type { AnimeAiringStatus, AnimeListStatus } from '@/domain/models/anime';
import type { AppLanguage } from '@/localization/languages';

const ERROR_KEYS = {
  network: 'errors.network',
  timeout: 'errors.timeout',
  rate_limit: 'errors.rateLimit',
  unavailable: 'errors.unavailable',
  not_found: 'errors.notFound',
  configuration: 'errors.configuration',
  unauthorized: 'errors.unauthorized',
  session_expired: 'errors.sessionExpired',
  primary_provider_required: 'errors.primaryProviderRequired',
  http: 'errors.http',
  invalid_response: 'errors.invalidResponse',
} as const;

const AUTH_ERROR_KEYS: Record<Exclude<AuthFailureCode, 'cancelled'>, string> = {
  configuration: 'auth.error.configuration',
  unsupported_environment: 'auth.error.unsupportedEnvironment',
  redirect: 'auth.error.redirect',
  network: 'auth.error.network',
  timeout: 'auth.error.timeout',
  provider_unavailable: 'auth.error.unavailable',
  invalid_token: 'auth.error.invalidToken',
  invalid_response: 'auth.error.invalidResponse',
  storage: 'auth.error.storage',
  unknown: 'auth.error.unknown',
};

const STATUS_KEYS: Record<AnimeListStatus, string> = {
  watching: 'status.watching',
  completed: 'status.completed',
  on_hold: 'status.onHold',
  dropped: 'status.dropped',
  plan_to_watch: 'status.planToWatch',
};

const AIRING_KEYS: Record<AnimeAiringStatus, string> = {
  releasing: 'airing.airing',
  finished: 'airing.finished',
  not_yet_released: 'airing.notYet',
  cancelled: 'airing.cancelled',
  hiatus: 'airing.hiatus',
  unknown: 'airing.unknown',
};

const SEASON_KEYS: Record<string, string> = {
  Fall: 'season.fall',
  Spring: 'season.spring',
  Summer: 'season.summer',
  Winter: 'season.winter',
};

const GENRE_KEYS: Record<string, string> = {
  Action: 'genre.action',
  Adventure: 'genre.adventure',
  Comedy: 'genre.comedy',
  Drama: 'genre.drama',
  Ecchi: 'genre.ecchi',
  Fantasy: 'genre.fantasy',
  Horror: 'genre.horror',
  'Mahou Shoujo': 'genre.mahouShoujo',
  Mecha: 'genre.mecha',
  Music: 'genre.music',
  Mystery: 'genre.mystery',
  Psychological: 'genre.psychological',
  Romance: 'genre.romance',
  'Sci-Fi': 'genre.sciFi',
  'Slice of Life': 'genre.sliceOfLife',
  Sports: 'genre.sports',
  Supernatural: 'genre.supernatural',
  Thriller: 'genre.thriller',
};

export function localizedError(error: unknown, t: TFunction): string {
  return error instanceof DataSourceError
    ? t(ERROR_KEYS[error.code])
    : t('errors.generic');
}

export function localizedAuthFailure(
  failure: AuthFailureCode,
  t: TFunction,
  provider: string = 'AniList',
): string {
  return failure === 'cancelled'
    ? t('common.cancel')
    : t(AUTH_ERROR_KEYS[failure], { provider });
}

export function localizedStatus(status: AnimeListStatus, t: TFunction): string {
  return t(STATUS_KEYS[status]);
}

export function localizedAiringStatus(
  status: AnimeAiringStatus,
  t: TFunction,
): string {
  return t(AIRING_KEYS[status]);
}

export function localizedSeason(season: string, t: TFunction): string {
  const key = SEASON_KEYS[season];
  return key ? t(key) : season;
}

export function localizedGenre(genre: string, t: TFunction): string {
  const key = GENRE_KEYS[genre];
  return key ? t(key) : genre;
}

export function formatDateTime(value: string, language: AppLanguage): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

export function formatNumber(
  value: number,
  language: AppLanguage,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(language, options).format(value);
}
