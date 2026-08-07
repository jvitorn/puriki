import { DataSourceError } from '@/domain/errors/domain-error';

export class CatalogUnavailableError extends DataSourceError {
  constructor(
    message = 'Both catalog providers are currently unavailable.',
    readonly primaryError?: unknown,
    readonly fallbackError?: unknown,
  ) {
    super('unavailable', message);
    this.name = 'CatalogUnavailableError';
  }
}
