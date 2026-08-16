import type { TFunction } from 'i18next';

import type { AuthFailureCode } from '@/application/auth/auth-contracts';
import { DataSourceError } from '@/domain/errors/domain-error';
import type { AnimeListStatus } from '@/domain/models/anime';
import type { AppLanguage } from '@/localization/languages';

const ERROR_KEYS = {
  network: 'errors.network',
  timeout: 'errors.timeout',
  rate_limit: 'errors.rateLimit',
  unavailable: 'errors.unavailable',
  not_found: 'errors.notFound',
  configuration: 'errors.configuration',
  unauthorized: 'errors.unauthorized',
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

const AIRING_KEYS: Record<string, string> = {
  Airing: 'airing.airing',
  'Finished Airing': 'airing.finished',
  'Not Yet Aired': 'airing.notYet',
};

export function localizedError(error: unknown, t: TFunction): string {
  return error instanceof DataSourceError
    ? t(ERROR_KEYS[error.code])
    : t('errors.generic');
}

export function localizedAuthFailure(
  failure: AuthFailureCode,
  t: TFunction,
): string {
  return failure === 'cancelled'
    ? t('common.cancel')
    : t(AUTH_ERROR_KEYS[failure]);
}

export function localizedStatus(status: AnimeListStatus, t: TFunction): string {
  return t(STATUS_KEYS[status]);
}

export function localizedAiringStatus(status: string, t: TFunction): string {
  const key = AIRING_KEYS[status];
  return key ? t(key) : status;
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
