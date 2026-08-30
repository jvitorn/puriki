import type { AuthSessionController } from '@/application/auth/auth-contracts';
import type { UserAnimeSync } from '@/application/sync/user-anime-sync';
import type { PrimaryListProviderController } from '@/application/user-list/primary-list-provider-contracts';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import type { SynopsisTranslationCache } from '@/domain/repositories/synopsis-translation-cache';
import type { UserAnimeListRepository } from '@/domain/repositories/user-anime-list-repository';
import type { SynopsisTranslator } from '@/domain/services/synopsis-translator';

export const CATALOG_OPERATION_FAMILIES = [
  'featured',
  'popular',
  'seasonal',
  'upcoming',
  'search',
  'details',
] as const;

export type CatalogOperationFamily =
  (typeof CATALOG_OPERATION_FAMILIES)[number];

export type CatalogCircuitState = 'closed' | 'open' | 'half_open';

export type PrimaryCatalogHealth =
  'healthy' | 'degraded' | 'unavailable' | 'rate_limited';

export type CatalogSuccessfulSource = 'anilist' | 'mal' | 'cache';

export interface CatalogOperationRuntimeStatus {
  circuitState: CatalogCircuitState;
  lastSuccessfulSource: CatalogSuccessfulSource | null;
  lastFallbackAt: string | null;
}

export interface CatalogRuntimeStatus {
  primaryProvider: 'anilist';
  primaryHealth: PrimaryCatalogHealth;
  primaryRateLimitedUntil: string | null;
  operations: Record<CatalogOperationFamily, CatalogOperationRuntimeStatus>;
}

export type AniListDiagnosticTestName =
  'details' | 'search' | 'popular' | 'seasonal' | 'upcoming' | 'combined_home';

export interface AniListDiagnosticReport {
  results: {
    testName: AniListDiagnosticTestName;
    ok: boolean;
    skipped: boolean;
    status: number | null;
    elapsedMs: number;
    responseBytes: number;
    rateLimit: {
      limit: number | null;
      remaining: number | null;
      retryAfterSeconds: number | null;
      resetAt: number | null;
    };
    errorKind:
      | 'none'
      | 'timeout'
      | 'network'
      | 'graphql'
      | 'http'
      | 'rate_limit'
      | 'format'
      | 'unknown';
    graphqlErrors: string[];
    message: string;
    resultCount: number | null;
    sampleTitle: string | null;
    pageInfo: {
      currentPage: number | null;
      hasNextPage: boolean | null;
      lastPage: number | null;
    } | null;
    sectionCounts: {
      popular: number;
      seasonal: number;
      upcoming: number;
    } | null;
    requestCount: number;
  }[];
  summary: {
    passed: number;
    total: number;
    averageLatencyMs: number;
    slowestTest: AniListDiagnosticTestName | null;
    totalResponseBytes: number;
    requestsMade: number;
    startingRemaining: number | null;
    endingRemaining: number | null;
    rateLimitResponses: number;
    stoppedByRateLimit: boolean;
  };
}

export interface MalConnectivityReport {
  ok: boolean;
  platform: string;
  status: number | null;
  elapsedMs: number;
  errorKind:
    | 'none'
    | 'not_configured'
    | 'unauthorized'
    | 'http'
    | 'rate_limit'
    | 'service_unavailable'
    | 'network'
    | 'timeout'
    | 'invalid_response';
  message: string;
  sampleAnimeTitle: string | null;
}

export interface OnboardingStore {
  hasCompleted(): Promise<boolean>;
  markCompleted(): Promise<void>;
}

export interface DeveloperSettingsStore {
  getDeveloperToolsEnabled(): Promise<boolean>;
  setDeveloperToolsEnabled(enabled: boolean): Promise<void>;
}

export interface SynopsisTranslationServices {
  translator: SynopsisTranslator;
  cache: SynopsisTranslationCache;
}

export interface RepositoryServices {
  catalogRepository: AnimeCatalogRepository;
  userListRepository: UserAnimeListRepository;
  syncEngine: UserAnimeSync;
  getCatalogRuntimeStatus(): CatalogRuntimeStatus;
  subscribeCatalogRuntimeStatus(
    listener: (status: CatalogRuntimeStatus) => void,
  ): () => void;
  clearCatalogCache(): void;
  resetPrimaryCircuits(): void;
  runAniListDiagnostic(): Promise<AniListDiagnosticReport>;
  runMalDiagnostic(): Promise<MalConnectivityReport>;
}

export interface ApplicationRuntime {
  authSession: AuthSessionController;
  primaryListProvider: PrimaryListProviderController;
  repositories: RepositoryServices;
  onboardingStore: OnboardingStore;
  developerSettingsStore: DeveloperSettingsStore;
  synopsisTranslation: SynopsisTranslationServices;
}
