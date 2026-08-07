import { Platform } from 'react-native';

import { CatalogUnavailableError } from '@/domain/errors/catalog-error';
import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import {
  JikanNetworkError,
  JikanRateLimitError,
  JikanResponseFormatError,
  JikanServiceUnavailableError,
  JikanTimeoutError,
} from '@/infrastructure/api/jikan/jikan-errors';
import { MalResponseFormatError } from '@/infrastructure/api/mal/mal-errors';
import {
  CatalogCircuitBreaker,
  type CircuitState,
} from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { normalizeSearchText } from '@/shared/utils/search';

export type CatalogSuccessfulSource = 'jikan' | 'mal' | 'cache';

export interface ResilientCatalogOptions {
  primary: AnimeCatalogRepository;
  fallback: AnimeCatalogRepository;
  circuitBreaker?: CatalogCircuitBreaker;
  cache?: ResilientCatalogCache;
  isFallbackAvailable?: () => boolean;
  onSourceUsed?: (source: CatalogSuccessfulSource) => void;
  onCircuitStateChange?: (state: CircuitState) => void;
  now?: () => number;
}

interface RefreshableCatalogRepository extends AnimeCatalogRepository {
  refresh(): Promise<void>;
}

interface OperationOptions {
  requireNonEmpty?: boolean;
}

class EmptyCatalogResultError extends JikanResponseFormatError {
  constructor() {
    super('Jikan returned an unexpectedly empty required collection.');
    this.name = 'EmptyCatalogResultError';
  }
}

export class ResilientCatalogCache {
  private readonly values = new Map<string, unknown>();

  has(key: string): boolean {
    return this.values.has(key);
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

function isRefreshable(
  repository: AnimeCatalogRepository,
): repository is RefreshableCatalogRepository {
  return (
    'refresh' in repository &&
    typeof (repository as { refresh?: unknown }).refresh === 'function'
  );
}

function isFallbackEligible(error: unknown): boolean {
  return (
    error instanceof JikanNetworkError ||
    error instanceof JikanTimeoutError ||
    error instanceof JikanRateLimitError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanResponseFormatError
  );
}

function failureKind(error: unknown): string {
  if (error instanceof JikanNetworkError) return 'network';
  if (error instanceof JikanTimeoutError) return 'timeout';
  if (error instanceof JikanRateLimitError) return 'rate_limit';
  if (error instanceof JikanServiceUnavailableError) {
    return 'service_unavailable';
  }
  if (error instanceof JikanResponseFormatError) return 'invalid_response';
  return 'skipped';
}

export class ResilientAnimeCatalogRepository implements AnimeCatalogRepository {
  private readonly primary: AnimeCatalogRepository;
  private readonly fallback: AnimeCatalogRepository;
  private readonly circuitBreaker: CatalogCircuitBreaker;
  private readonly cache: ResilientCatalogCache;
  private readonly isFallbackAvailable: () => boolean;
  private readonly onSourceUsed?: (source: CatalogSuccessfulSource) => void;
  private readonly onCircuitStateChange?: (state: CircuitState) => void;
  private readonly now: () => number;

  constructor(options: ResilientCatalogOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.circuitBreaker = options.circuitBreaker ?? new CatalogCircuitBreaker();
    this.cache = options.cache ?? new ResilientCatalogCache();
    this.isFallbackAvailable = options.isFallbackAvailable ?? (() => true);
    this.onSourceUsed = options.onSourceUsed;
    this.onCircuitStateChange = options.onCircuitStateChange;
    this.now = options.now ?? Date.now;
  }

  getFeatured(): Promise<AnimeCatalogItem> {
    return this.execute(
      'featured',
      () => this.primary.getFeatured(),
      () => this.fallback.getFeatured(),
    );
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'popular',
      () => this.primary.getPopular(),
      () => this.fallback.getPopular(),
      { requireNonEmpty: true },
    );
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'seasonal',
      () => this.primary.getSeasonal(),
      () => this.fallback.getSeasonal(),
      { requireNonEmpty: true },
    );
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'upcoming',
      () => this.primary.getUpcoming(),
      () => this.fallback.getUpcoming(),
      { requireNonEmpty: true },
    );
  }

  search(query: string): Promise<AnimeCatalogItem[]> {
    const normalized = normalizeSearchText(query);
    return this.execute(
      `search:${normalized}`,
      () => this.primary.search(normalized),
      () => this.fallback.search(normalized),
    );
  }

  getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    const normalizedIds = [
      ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
    ].sort((left, right) => left - right);
    return this.execute(
      `many:${normalizedIds.join(',')}`,
      () => this.primary.getManyByIds(normalizedIds),
      () => this.fallback.getManyByIds(normalizedIds),
    );
  }

  getDetailsById(id: number): Promise<AnimeCatalogItem | null> {
    return this.execute(
      `details:${id}`,
      () => this.primary.getDetailsById(id),
      () => this.fallback.getDetailsById(id),
    );
  }

  async refresh(): Promise<void> {
    const primaryRefresh = () =>
      isRefreshable(this.primary) ? this.primary.refresh() : Promise.resolve();
    const fallbackRefresh = () =>
      isRefreshable(this.fallback)
        ? this.fallback.refresh()
        : Promise.resolve();
    let primaryError: unknown;
    const primaryAllowed = this.circuitBreaker.allowRequest();
    this.circuitChanged();
    if (primaryAllowed) {
      try {
        await primaryRefresh();
        this.circuitBreaker.recordSuccess();
        this.circuitChanged();
        this.cache.clear();
        this.sourceUsed('jikan');
        return;
      } catch (error: unknown) {
        if (!isFallbackEligible(error)) {
          this.circuitBreaker.recordIgnoredFailure();
          this.circuitChanged();
          throw error;
        }
        primaryError = error;
        this.circuitBreaker.recordFailure();
        this.circuitChanged();
      }
    }
    if (!this.isFallbackAvailable()) {
      throw (
        primaryError ??
        new CatalogUnavailableError(
          'Jikan is unavailable and the MyAnimeList fallback is not configured.',
        )
      );
    }
    try {
      await fallbackRefresh();
      this.cache.clear();
      this.sourceUsed('mal');
    } catch (fallbackError: unknown) {
      throw new CatalogUnavailableError(undefined, primaryError, fallbackError);
    }
  }

  clearCache(): void {
    this.primary.clearCache();
    this.fallback.clearCache();
    this.cache.clear();
    this.circuitBreaker.reset();
    this.circuitChanged();
  }

  getCircuitState(): CircuitState {
    return this.circuitBreaker.getState();
  }

  private async execute<T>(
    operation: string,
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    options: OperationOptions = {},
  ): Promise<T> {
    const startedAt = this.now();
    let primaryError: unknown;
    const primaryAllowed = this.circuitBreaker.allowRequest();
    this.circuitChanged();
    if (primaryAllowed) {
      try {
        const value = await primary();
        this.ensureUsable(value, options);
        this.circuitBreaker.recordSuccess();
        this.circuitChanged();
        this.cache.set(operation, value);
        this.sourceUsed('jikan');
        this.log(operation, 'jikan', undefined, startedAt, false);
        return value;
      } catch (error: unknown) {
        if (!isFallbackEligible(error)) {
          this.circuitBreaker.recordIgnoredFailure();
          this.circuitChanged();
          throw error;
        }
        primaryError = error;
        this.circuitBreaker.recordFailure();
        this.circuitChanged();
      }
    }

    if (this.isFallbackAvailable()) {
      try {
        const value = await fallback();
        this.ensureUsable(value, options, true);
        this.cache.set(operation, value);
        this.sourceUsed('mal');
        this.log(operation, 'mal', primaryError, startedAt, true);
        return value;
      } catch (fallbackError: unknown) {
        const cached = this.cached<T>(operation);
        if (cached.found) {
          this.sourceUsed('cache');
          this.log(operation, 'cache', primaryError, startedAt, true);
          return cached.value;
        }
        throw new CatalogUnavailableError(
          undefined,
          primaryError,
          fallbackError,
        );
      }
    }

    const cached = this.cached<T>(operation);
    if (cached.found) {
      this.sourceUsed('cache');
      this.log(operation, 'cache', primaryError, startedAt, false);
      return cached.value;
    }
    throw (
      primaryError ??
      new CatalogUnavailableError(
        'Jikan is unavailable and the MyAnimeList fallback is not configured.',
      )
    );
  }

  private ensureUsable<T>(
    value: T,
    options: OperationOptions,
    fallback = false,
  ): void {
    if (options.requireNonEmpty && Array.isArray(value) && value.length === 0) {
      if (fallback) {
        throw new MalResponseFormatError(
          'MyAnimeList returned an unexpectedly empty required collection.',
        );
      }
      throw new EmptyCatalogResultError();
    }
  }

  private cached<T>(
    key: string,
  ): { found: true; value: T } | { found: false; value?: never } {
    return this.cache.has(key)
      ? { found: true, value: this.cache.get<T>(key) as T }
      : { found: false };
  }

  private sourceUsed(source: CatalogSuccessfulSource): void {
    this.onSourceUsed?.(source);
  }

  private circuitChanged(): void {
    this.onCircuitStateChange?.(this.circuitBreaker.getState());
  }

  private log(
    operation: string,
    successfulSource: CatalogSuccessfulSource,
    primaryError: unknown,
    startedAt: number,
    fallbackUsed: boolean,
  ): void {
    if (process.env.NODE_ENV !== 'development') return;
    console.info('[Catalog] operation completed', {
      operation,
      requestedSource: 'automatic',
      successfulSource,
      jikanFailure: failureKind(primaryError),
      jikanCircuitState: this.circuitBreaker.getState(),
      fallbackUsed,
      elapsedMs: Math.max(0, this.now() - startedAt),
      platform: Platform.OS,
    });
  }
}
