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
import type { CircuitState } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker';
import { CatalogCircuitBreakerRegistry } from '@/infrastructure/repositories/resilient/catalog-circuit-breaker-registry';
import {
  CatalogItemStore,
  normalizeCatalogItemIds,
  type CatalogItemCompleteness,
  type CatalogItemMetadata,
  type CatalogItemSource,
} from '@/infrastructure/repositories/resilient/catalog-item-store';
import {
  JIKAN_DISCOVERY_OPERATION_FAMILIES,
  JIKAN_OPERATION_FAMILIES,
  type JikanDiscoveryOperationFamily,
  type JikanHealth,
  type JikanOperationFamily,
} from '@/infrastructure/repositories/resilient/catalog-operation-family';
import { JikanRateLimitGate } from '@/infrastructure/repositories/resilient/jikan-rate-limit-gate';
import { normalizeSearchText } from '@/shared/utils/search';

export type CatalogSuccessfulSource = CatalogItemSource;
export type { JikanHealth } from '@/infrastructure/repositories/resilient/catalog-operation-family';
export type JikanSkipReason = 'family_circuit_open' | 'provider_rate_limited';

export interface CatalogOperationRuntimeStatus {
  circuitState: CircuitState;
  lastSuccessfulSource: CatalogSuccessfulSource | null;
  lastFallbackAt: number | null;
}

export interface ResilientCatalogRuntimeSnapshot {
  jikanHealth: JikanHealth;
  jikanRateLimitedUntil: number | null;
  operations: Record<JikanOperationFamily, CatalogOperationRuntimeStatus>;
}

export interface ResilientCatalogOptions {
  primary: AnimeCatalogRepository;
  fallback: AnimeCatalogRepository;
  circuitRegistry?: CatalogCircuitBreakerRegistry;
  rateLimitGate?: JikanRateLimitGate;
  cache?: ResilientCatalogCache;
  itemStore?: CatalogItemStore;
  isFallbackAvailable?: () => boolean;
  onRuntimeStatusChange?: (snapshot: ResilientCatalogRuntimeSnapshot) => void;
  now?: () => number;
}

interface FamilyRefreshableCatalogRepository extends AnimeCatalogRepository {
  refreshFamily(family: JikanDiscoveryOperationFamily): Promise<void>;
}

interface OperationOptions {
  requireNonEmpty?: boolean;
  completeness?: CatalogItemCompleteness;
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

function supportsFamilyRefresh(
  repository: AnimeCatalogRepository,
): repository is FamilyRefreshableCatalogRepository {
  return (
    'refreshFamily' in repository &&
    typeof (repository as { refreshFamily?: unknown }).refreshFamily ===
      'function'
  );
}

function refreshFamily(
  repository: AnimeCatalogRepository,
  family: JikanDiscoveryOperationFamily,
): Promise<void> {
  if (supportsFamilyRefresh(repository))
    return repository.refreshFamily(family);
  if (family === 'popular')
    return repository.getPopular().then(() => undefined);
  if (family === 'seasonal')
    return repository.getSeasonal().then(() => undefined);
  return repository.getUpcoming().then(() => undefined);
}

function isFallbackEligible(error: unknown): boolean {
  return isCircuitFailure(error) || error instanceof JikanRateLimitError;
}

function isCircuitFailure(error: unknown): boolean {
  return (
    error instanceof JikanNetworkError ||
    error instanceof JikanTimeoutError ||
    error instanceof JikanServiceUnavailableError ||
    error instanceof JikanResponseFormatError
  );
}

function failureKind(error: unknown): string | null {
  if (error instanceof JikanNetworkError) return 'network';
  if (error instanceof JikanTimeoutError) return 'timeout';
  if (error instanceof JikanRateLimitError) return 'rate_limit';
  if (error instanceof JikanServiceUnavailableError) {
    return 'service_unavailable';
  }
  if (error instanceof JikanResponseFormatError) return 'invalid_response';
  return null;
}

function isAnimeCatalogItem(value: unknown): value is AnimeCatalogItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    Number.isInteger(value.id) &&
    'title' in value &&
    typeof value.title === 'string' &&
    'alternativeTitles' in value &&
    Array.isArray(value.alternativeTitles) &&
    'genres' in value &&
    Array.isArray(value.genres) &&
    'studios' in value &&
    Array.isArray(value.studios) &&
    'continuity' in value &&
    Array.isArray(value.continuity)
  );
}

function emptyOperationSources(): Record<
  JikanOperationFamily,
  {
    lastSuccessfulSource: CatalogSuccessfulSource | null;
    lastFallbackAt: number | null;
  }
> {
  return Object.fromEntries(
    JIKAN_OPERATION_FAMILIES.map((family) => [
      family,
      { lastSuccessfulSource: null, lastFallbackAt: null },
    ]),
  ) as Record<
    JikanOperationFamily,
    {
      lastSuccessfulSource: CatalogSuccessfulSource | null;
      lastFallbackAt: number | null;
    }
  >;
}

export class ResilientAnimeCatalogRepository implements AnimeCatalogRepository {
  private readonly primary: AnimeCatalogRepository;
  private readonly fallback: AnimeCatalogRepository;
  private readonly circuitRegistry: CatalogCircuitBreakerRegistry;
  private readonly rateLimitGate: JikanRateLimitGate;
  private readonly cache: ResilientCatalogCache;
  private readonly itemStore: CatalogItemStore;
  private readonly isFallbackAvailable: () => boolean;
  private readonly onRuntimeStatusChange?: (
    snapshot: ResilientCatalogRuntimeSnapshot,
  ) => void;
  private readonly now: () => number;
  private readonly operationSources = emptyOperationSources();

  constructor(options: ResilientCatalogOptions) {
    this.primary = options.primary;
    this.fallback = options.fallback;
    this.now = options.now ?? Date.now;
    this.circuitRegistry =
      options.circuitRegistry ??
      new CatalogCircuitBreakerRegistry({ now: this.now });
    this.rateLimitGate =
      options.rateLimitGate ?? new JikanRateLimitGate({ now: this.now });
    this.cache = options.cache ?? new ResilientCatalogCache();
    this.itemStore = options.itemStore ?? new CatalogItemStore();
    this.isFallbackAvailable = options.isFallbackAvailable ?? (() => true);
    this.onRuntimeStatusChange = options.onRuntimeStatusChange;
  }

  getFeatured(): Promise<AnimeCatalogItem> {
    return this.execute(
      'featured',
      'featured',
      () => this.primary.getFeatured(),
      () => this.fallback.getFeatured(),
    );
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'popular',
      'popular',
      () => this.primary.getPopular(),
      () => this.fallback.getPopular(),
      { requireNonEmpty: true },
    );
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'seasonal',
      'seasonal',
      () => this.primary.getSeasonal(),
      () => this.fallback.getSeasonal(),
      { requireNonEmpty: true },
    );
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.execute(
      'upcoming',
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
      'search',
      () => this.primary.search(normalized),
      () => this.fallback.search(normalized),
    );
  }

  async getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    const normalizedIds = normalizeCatalogItemIds(ids);
    const resolved = new Map<number, AnimeCatalogItem>();
    let summaryHits = 0;
    let detailHits = 0;
    normalizedIds.forEach((id) => {
      const stored = this.itemStore.get(id);
      if (!stored) return;
      resolved.set(id, stored.item);
      if (stored.completeness === 'details') detailHits += 1;
      else summaryHits += 1;
    });
    const missingIds = normalizedIds.filter((id) => !resolved.has(id));
    let jikanSkippedAfterCircuit = false;
    let jikanSkippedAfterRateLimit = false;

    for (const id of missingIds) {
      if (this.rateLimitGate.isBlocked()) {
        jikanSkippedAfterRateLimit = true;
      } else if (this.circuitRegistry.get('details').getState() === 'open') {
        jikanSkippedAfterCircuit = true;
      }
      const item = await this.getDetailsById(id);
      if (item) resolved.set(item.id, item);
    }

    const result = normalizedIds.flatMap((id) => {
      const item = this.itemStore.getItem(id, 'summary') ?? resolved.get(id);
      return item ? [item] : [];
    });
    this.logManyResolution({
      requested: normalizedIds.length,
      summaryHits,
      detailHits,
      networkMissing: missingIds.length,
      detailResolutions: missingIds.length,
      jikanSkippedAfterCircuit,
      jikanSkippedAfterRateLimit,
    });
    return result;
  }

  getDetailsById(id: number): Promise<AnimeCatalogItem | null> {
    const storedDetails = this.itemStore.getItem(id, 'details');
    if (storedDetails) return Promise.resolve(storedDetails);
    return this.execute(
      `details:${id}`,
      'details',
      () => this.primary.getDetailsById(id),
      () => this.fallback.getDetailsById(id),
      { completeness: 'details' },
    );
  }

  getKnownById(id: number): AnimeCatalogItem | null {
    return this.itemStore.getItem(id, 'summary') ?? null;
  }

  async refresh(): Promise<void> {
    const results = await Promise.allSettled(
      JIKAN_DISCOVERY_OPERATION_FAMILIES.map((family) =>
        this.refreshOperationFamily(family),
      ),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }

  clearCache(): void {
    this.primary.clearCache();
    this.fallback.clearCache();
    this.cache.clear();
    this.itemStore.clear();
    this.emitRuntimeStatus();
  }

  resetCircuits(family?: JikanOperationFamily): void {
    this.circuitRegistry.reset(family);
    this.emitRuntimeStatus();
  }

  getCircuitState(family: JikanOperationFamily): CircuitState {
    return this.circuitRegistry.get(family).getState();
  }

  getRuntimeSnapshot(): ResilientCatalogRuntimeSnapshot {
    const circuitSnapshots = this.circuitRegistry.getSnapshot();
    const rateLimitedUntil = this.rateLimitGate.getBlockedUntil();
    const states = JIKAN_OPERATION_FAMILIES.map(
      (family) => circuitSnapshots[family].state,
    );
    const jikanHealth: JikanHealth = rateLimitedUntil
      ? 'rate_limited'
      : states.every((state) => state === 'open')
        ? 'unavailable'
        : states.some((state) => state !== 'closed')
          ? 'degraded'
          : 'healthy';
    return {
      jikanHealth,
      jikanRateLimitedUntil: rateLimitedUntil,
      operations: Object.fromEntries(
        JIKAN_OPERATION_FAMILIES.map((family) => [
          family,
          {
            circuitState: circuitSnapshots[family].state,
            ...this.operationSources[family],
          },
        ]),
      ) as Record<JikanOperationFamily, CatalogOperationRuntimeStatus>,
    };
  }

  private async execute<T>(
    operation: string,
    family: JikanOperationFamily,
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
    options: OperationOptions = {},
  ): Promise<T> {
    const startedAt = this.now();
    const completeness = options.completeness ?? 'summary';
    const primaryAttempt = this.beginPrimaryAttempt(family);
    let primaryError: unknown;

    if (primaryAttempt.allowed) {
      try {
        const value = await primary();
        this.ensureUsable(value, options);
        this.circuitRegistry.get(family).recordSuccess();
        this.cache.set(operation, value);
        this.ingestCatalogValue(value, {
          source: 'jikan',
          completeness,
        });
        this.sourceUsed(family, 'jikan');
        this.log({
          family,
          fallbackUsed: false,
          jikanAttempted: true,
          jikanSkipReason: null,
          operation,
          primaryError: undefined,
          startedAt,
          successfulSource: 'jikan',
        });
        return value;
      } catch (error: unknown) {
        if (!isFallbackEligible(error)) {
          this.circuitRegistry.get(family).recordIgnoredFailure();
          this.emitRuntimeStatus();
          throw error;
        }
        primaryError = error;
        this.recordPrimaryFailure(family, error);
      }
    }

    if (this.isFallbackAvailable()) {
      try {
        const value = await fallback();
        this.ensureUsable(value, options, true);
        this.cache.set(operation, value);
        this.ingestCatalogValue(value, { source: 'mal', completeness });
        this.sourceUsed(family, 'mal');
        this.log({
          family,
          fallbackUsed: true,
          jikanAttempted: primaryAttempt.attempted,
          jikanSkipReason: primaryAttempt.skipReason,
          operation,
          primaryError,
          startedAt,
          successfulSource: 'mal',
        });
        return value;
      } catch (fallbackError: unknown) {
        const cached = this.cached<T>(operation);
        if (cached.found) {
          this.ingestCatalogValue(cached.value, {
            source: 'cache',
            completeness,
          });
          this.sourceUsed(family, 'cache');
          this.log({
            family,
            fallbackUsed: true,
            jikanAttempted: primaryAttempt.attempted,
            jikanSkipReason: primaryAttempt.skipReason,
            operation,
            primaryError,
            startedAt,
            successfulSource: 'cache',
          });
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
      this.ingestCatalogValue(cached.value, {
        source: 'cache',
        completeness,
      });
      this.sourceUsed(family, 'cache');
      this.log({
        family,
        fallbackUsed: true,
        jikanAttempted: primaryAttempt.attempted,
        jikanSkipReason: primaryAttempt.skipReason,
        operation,
        primaryError,
        startedAt,
        successfulSource: 'cache',
      });
      return cached.value;
    }
    throw (
      primaryError ??
      new CatalogUnavailableError(
        'Jikan is unavailable and the MyAnimeList fallback is not configured.',
      )
    );
  }

  private async refreshOperationFamily(
    family: JikanDiscoveryOperationFamily,
  ): Promise<void> {
    const operation = `refresh:${family}`;
    const startedAt = this.now();
    const primaryAttempt = this.beginPrimaryAttempt(family);
    let primaryError: unknown;

    if (primaryAttempt.allowed) {
      try {
        await refreshFamily(this.primary, family);
        this.circuitRegistry.get(family).recordSuccess();
        this.sourceUsed(family, 'jikan');
        this.log({
          family,
          fallbackUsed: false,
          jikanAttempted: true,
          jikanSkipReason: null,
          operation,
          primaryError: undefined,
          startedAt,
          successfulSource: 'jikan',
        });
        return;
      } catch (error: unknown) {
        if (!isFallbackEligible(error)) {
          this.circuitRegistry.get(family).recordIgnoredFailure();
          this.emitRuntimeStatus();
          throw error;
        }
        primaryError = error;
        this.recordPrimaryFailure(family, error);
      }
    }

    if (this.isFallbackAvailable()) {
      try {
        await refreshFamily(this.fallback, family);
        this.sourceUsed(family, 'mal');
        this.log({
          family,
          fallbackUsed: true,
          jikanAttempted: primaryAttempt.attempted,
          jikanSkipReason: primaryAttempt.skipReason,
          operation,
          primaryError,
          startedAt,
          successfulSource: 'mal',
        });
        return;
      } catch (fallbackError: unknown) {
        if (this.cache.has(family)) {
          this.sourceUsed(family, 'cache');
          return;
        }
        throw new CatalogUnavailableError(
          undefined,
          primaryError,
          fallbackError,
        );
      }
    }

    if (this.cache.has(family)) {
      this.sourceUsed(family, 'cache');
      return;
    }
    throw (
      primaryError ??
      new CatalogUnavailableError(
        'Jikan is unavailable and the MyAnimeList fallback is not configured.',
      )
    );
  }

  private beginPrimaryAttempt(family: JikanOperationFamily): {
    allowed: boolean;
    attempted: boolean;
    skipReason: JikanSkipReason | null;
  } {
    if (this.rateLimitGate.isBlocked()) {
      this.emitRuntimeStatus();
      return {
        allowed: false,
        attempted: false,
        skipReason: 'provider_rate_limited',
      };
    }
    const allowed = this.circuitRegistry.get(family).allowRequest();
    this.emitRuntimeStatus();
    return {
      allowed,
      attempted: allowed,
      skipReason: allowed ? null : 'family_circuit_open',
    };
  }

  private recordPrimaryFailure(
    family: JikanOperationFamily,
    error: unknown,
  ): void {
    const breaker = this.circuitRegistry.get(family);
    if (error instanceof JikanRateLimitError) {
      this.rateLimitGate.block(error.retryAfterMs);
      breaker.recordIgnoredFailure();
    } else if (isCircuitFailure(error)) {
      breaker.recordFailure();
    }
    this.emitRuntimeStatus();
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

  private sourceUsed(
    family: JikanOperationFamily,
    source: CatalogSuccessfulSource,
  ): void {
    const operation = this.operationSources[family];
    operation.lastSuccessfulSource = source;
    if (source === 'mal') operation.lastFallbackAt = this.now();
    this.emitRuntimeStatus();
  }

  private emitRuntimeStatus(): void {
    this.onRuntimeStatusChange?.(this.getRuntimeSnapshot());
  }

  private ingestCatalogValue(
    value: unknown,
    metadata: CatalogItemMetadata,
  ): void {
    if (Array.isArray(value)) {
      this.itemStore.upsertMany(value.filter(isAnimeCatalogItem), metadata);
      return;
    }
    if (isAnimeCatalogItem(value)) this.itemStore.upsert(value, metadata);
  }

  private logManyResolution(summary: {
    requested: number;
    summaryHits: number;
    detailHits: number;
    networkMissing: number;
    detailResolutions: number;
    jikanSkippedAfterCircuit: boolean;
    jikanSkippedAfterRateLimit: boolean;
  }): void {
    if (process.env.NODE_ENV !== 'development') return;
    console.info('[Catalog] getManyByIds completed', summary);
  }

  private log({
    family,
    fallbackUsed,
    jikanAttempted,
    jikanSkipReason,
    operation,
    primaryError,
    startedAt,
    successfulSource,
  }: {
    family: JikanOperationFamily;
    fallbackUsed: boolean;
    jikanAttempted: boolean;
    jikanSkipReason: JikanSkipReason | null;
    operation: string;
    primaryError: unknown;
    startedAt: number;
    successfulSource: CatalogSuccessfulSource;
  }): void {
    if (process.env.NODE_ENV !== 'development') return;
    console.info('[Catalog] operation completed', {
      operation,
      family,
      requestedSource: 'automatic',
      successfulSource,
      jikanAttempted,
      jikanSkipReason,
      jikanFailure: failureKind(primaryError),
      jikanCircuitState: this.circuitRegistry.get(family).getState(),
      fallbackUsed,
      elapsedMs: Math.max(0, this.now() - startedAt),
      platform: Platform.OS,
    });
  }
}
