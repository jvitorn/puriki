import {
  AniListDiagnosticClient,
  type AniListClientOptions,
  type AniListGraphQLResponse,
} from '@/infrastructure/api/anilist/anilist-client';
import {
  AniListDiagnosticCoordinator,
  type AniListDiagnosticCoordinatorOptions,
} from '@/infrastructure/api/anilist/anilist-diagnostic-coordinator';
import {
  aniListDisplayTitle,
  parseAniListCombinedHomeData,
  parseAniListDetailsData,
  parseAniListPageData,
  type AniListPageInfo,
} from '@/infrastructure/api/anilist/anilist-dtos';
import {
  AniListDiagnosticError,
  type AniListDiagnosticErrorKind,
  type AniListRateLimitMetrics,
} from '@/infrastructure/api/anilist/anilist-errors';
import {
  ANILIST_COMBINED_HOME_QUERY,
  ANILIST_DETAILS_QUERY,
  ANILIST_POPULAR_QUERY,
  ANILIST_SEARCH_QUERY,
  ANILIST_SEASONAL_QUERY,
  ANILIST_UPCOMING_QUERY,
} from '@/infrastructure/api/anilist/anilist-queries';

export type AniListDiagnosticTestName =
  'details' | 'search' | 'popular' | 'seasonal' | 'upcoming' | 'combined_home';

export type AniListSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

export interface AniListDiagnosticResult {
  testName: AniListDiagnosticTestName;
  ok: boolean;
  skipped: boolean;
  status: number | null;
  elapsedMs: number;
  responseBytes: number;
  rateLimit: AniListRateLimitMetrics;
  errorKind: AniListDiagnosticErrorKind;
  graphqlErrors: string[];
  message: string;
  resultCount: number | null;
  sampleTitle: string | null;
  pageInfo: AniListPageInfo | null;
  sectionCounts: {
    popular: number;
    seasonal: number;
    upcoming: number;
  } | null;
  requestCount: number;
}

export interface AniListRunAllProgress {
  current: number;
  total: number;
  testName: AniListDiagnosticTestName;
}

export interface AniListRunAllSummary {
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
}

export interface AniListRunAllResult {
  results: AniListDiagnosticResult[];
  summary: AniListRunAllSummary;
}

export interface AniListDiagnosticSuiteOptions {
  client?: AniListDiagnosticClient;
  clientOptions?: AniListClientOptions;
  coordinator?: AniListDiagnosticCoordinator;
  coordinatorOptions?: AniListDiagnosticCoordinatorOptions;
  currentDate?: () => Date;
}

interface ParsedDiagnosticData {
  resultCount: number;
  sampleTitle: string | null;
  pageInfo?: AniListPageInfo | null;
  sectionCounts?: AniListDiagnosticResult['sectionCounts'];
}

interface ExecuteDefinition {
  testName: AniListDiagnosticTestName;
  query: string;
  variables?: Record<string, unknown>;
  parse(data: unknown): ParsedDiagnosticData;
}

export const ANILIST_DEFAULT_DETAILS_MAL_ID = 21;
export const ANILIST_DEFAULT_SEARCH = 'Naruto';
export const ANILIST_COLLECTION_SIZE = 10;
export const ANILIST_RUN_ALL_REQUEST_COUNT = 5;

function emptyRateLimit(): AniListRateLimitMetrics {
  return {
    limit: null,
    remaining: null,
    retryAfterSeconds: null,
    resetAt: null,
  };
}

function baseResult(
  testName: AniListDiagnosticTestName,
): AniListDiagnosticResult {
  return {
    testName,
    ok: false,
    skipped: false,
    status: null,
    elapsedMs: 0,
    responseBytes: 0,
    rateLimit: emptyRateLimit(),
    errorKind: 'unknown',
    graphqlErrors: [],
    message: 'AniList diagnostic failed.',
    resultCount: null,
    sampleTitle: null,
    pageInfo: null,
    sectionCounts: null,
    requestCount: 1,
  };
}

function skippedResult(
  testName: AniListDiagnosticTestName,
): AniListDiagnosticResult {
  return {
    ...baseResult(testName),
    skipped: true,
    errorKind: 'none',
    message: 'Skipped after AniList returned a rate-limit response.',
    requestCount: 0,
  };
}

export function aniListSeasonForDate(date: Date): {
  season: AniListSeason;
  seasonYear: number;
} {
  const month = date.getMonth();
  const season: AniListSeason =
    month === 11 || month <= 1
      ? 'WINTER'
      : month <= 4
        ? 'SPRING'
        : month <= 7
          ? 'SUMMER'
          : 'FALL';
  return { season, seasonYear: date.getFullYear() };
}

export class AniListDiagnosticSuite {
  private readonly client: AniListDiagnosticClient;
  private readonly coordinator: AniListDiagnosticCoordinator;
  private readonly currentDate: () => Date;

  constructor(options: AniListDiagnosticSuiteOptions = {}) {
    this.client =
      options.client ?? new AniListDiagnosticClient(options.clientOptions);
    this.coordinator =
      options.coordinator ??
      new AniListDiagnosticCoordinator(options.coordinatorOptions);
    this.currentDate = options.currentDate ?? (() => new Date());
  }

  runDetails(): Promise<AniListDiagnosticResult> {
    return this.execute({
      testName: 'details',
      query: ANILIST_DETAILS_QUERY,
      variables: { idMal: ANILIST_DEFAULT_DETAILS_MAL_ID },
      parse: (data) => {
        const media = parseAniListDetailsData(data);
        return {
          resultCount: 1,
          sampleTitle: aniListDisplayTitle(media),
        };
      },
    });
  }

  runSearch(search = ANILIST_DEFAULT_SEARCH): Promise<AniListDiagnosticResult> {
    const normalizedSearch = search.trim() || ANILIST_DEFAULT_SEARCH;
    return this.execute({
      testName: 'search',
      query: ANILIST_SEARCH_QUERY,
      variables: {
        search: normalizedSearch,
        page: 1,
        perPage: ANILIST_COLLECTION_SIZE,
      },
      parse: (data) => {
        const page = parseAniListPageData(data);
        return {
          resultCount: page.media.length,
          sampleTitle: page.media[0]
            ? aniListDisplayTitle(page.media[0])
            : null,
          pageInfo: page.pageInfo,
        };
      },
    });
  }

  runPopular(): Promise<AniListDiagnosticResult> {
    return this.runCollection('popular', ANILIST_POPULAR_QUERY, {
      page: 1,
      perPage: ANILIST_COLLECTION_SIZE,
    });
  }

  runSeasonal(): Promise<AniListDiagnosticResult> {
    const { season, seasonYear } = aniListSeasonForDate(this.currentDate());
    return this.runCollection('seasonal', ANILIST_SEASONAL_QUERY, {
      season,
      seasonYear,
      page: 1,
      perPage: ANILIST_COLLECTION_SIZE,
    });
  }

  runUpcoming(): Promise<AniListDiagnosticResult> {
    return this.runCollection('upcoming', ANILIST_UPCOMING_QUERY, {
      page: 1,
      perPage: ANILIST_COLLECTION_SIZE,
    });
  }

  runCombinedHome(): Promise<AniListDiagnosticResult> {
    const { season, seasonYear } = aniListSeasonForDate(this.currentDate());
    return this.execute({
      testName: 'combined_home',
      query: ANILIST_COMBINED_HOME_QUERY,
      variables: { season, seasonYear, perPage: ANILIST_COLLECTION_SIZE },
      parse: (data) => {
        const combined = parseAniListCombinedHomeData(data);
        const media = [
          ...combined.popular,
          ...combined.seasonal,
          ...combined.upcoming,
        ];
        return {
          resultCount: media.length,
          sampleTitle: media[0] ? aniListDisplayTitle(media[0]) : null,
          sectionCounts: {
            popular: combined.popular.length,
            seasonal: combined.seasonal.length,
            upcoming: combined.upcoming.length,
          },
        };
      },
    });
  }

  async runAll(
    options: {
      search?: string;
      onProgress?: (progress: AniListRunAllProgress) => void;
    } = {},
  ): Promise<AniListRunAllResult> {
    const sequence: readonly {
      testName: AniListDiagnosticTestName;
      run: () => Promise<AniListDiagnosticResult>;
    }[] = [
      { testName: 'details', run: () => this.runDetails() },
      { testName: 'search', run: () => this.runSearch(options.search) },
      { testName: 'popular', run: () => this.runPopular() },
      { testName: 'seasonal', run: () => this.runSeasonal() },
      { testName: 'upcoming', run: () => this.runUpcoming() },
    ];
    const results: AniListDiagnosticResult[] = [];
    let stoppedByRateLimit = false;
    for (const [index, step] of sequence.entries()) {
      options.onProgress?.({
        current: index + 1,
        total: sequence.length,
        testName: step.testName,
      });
      if (stoppedByRateLimit) {
        results.push(skippedResult(step.testName));
        continue;
      }
      const result = await step.run();
      results.push(result);
      stoppedByRateLimit = result.errorKind === 'rate_limit';
    }
    return { results, summary: summarizeRunAll(results) };
  }

  private runCollection(
    testName: 'popular' | 'seasonal' | 'upcoming',
    query: string,
    variables: Record<string, unknown>,
  ): Promise<AniListDiagnosticResult> {
    return this.execute({
      testName,
      query,
      variables,
      parse: (data) => {
        const page = parseAniListPageData(data);
        return {
          resultCount: page.media.length,
          sampleTitle: page.media[0]
            ? aniListDisplayTitle(page.media[0])
            : null,
          pageInfo: page.pageInfo,
        };
      },
    });
  }

  private async execute(
    definition: ExecuteDefinition,
  ): Promise<AniListDiagnosticResult> {
    let response: AniListGraphQLResponse;
    try {
      response = await this.coordinator.schedule(() =>
        this.client.execute({
          testName: definition.testName,
          query: definition.query,
          variables: definition.variables,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof AniListDiagnosticError) {
        if (error.kind === 'rate_limit') {
          this.coordinator.respectRateLimit(error.metrics.rateLimit);
        }
        return {
          ...baseResult(definition.testName),
          status: error.metrics.status,
          elapsedMs: error.metrics.elapsedMs,
          responseBytes: error.metrics.responseBytes,
          rateLimit: error.metrics.rateLimit,
          errorKind: error.kind,
          graphqlErrors: error.metrics.graphqlErrors,
          message: error.message,
        };
      }
      return {
        ...baseResult(definition.testName),
        message:
          error instanceof Error
            ? error.message
            : 'AniList diagnostic failed unexpectedly.',
      };
    }

    const result: AniListDiagnosticResult = {
      ...baseResult(definition.testName),
      status: response.status,
      elapsedMs: response.elapsedMs,
      responseBytes: response.responseBytes,
      rateLimit: response.rateLimit,
      graphqlErrors: response.graphqlErrors,
      errorKind: response.graphqlErrors.length > 0 ? 'graphql' : 'none',
      message:
        response.graphqlErrors[0] ??
        'AniList diagnostic completed successfully.',
      ok: response.graphqlErrors.length === 0,
    };
    try {
      const parsed = definition.parse(response.data);
      return {
        ...result,
        resultCount: parsed.resultCount,
        sampleTitle: parsed.sampleTitle,
        pageInfo: parsed.pageInfo ?? null,
        sectionCounts: parsed.sectionCounts ?? null,
      };
    } catch (error: unknown) {
      return {
        ...result,
        ok: false,
        errorKind: response.graphqlErrors.length > 0 ? 'graphql' : 'format',
        message:
          response.graphqlErrors[0] ??
          (error instanceof Error
            ? error.message
            : 'AniList returned an invalid response.'),
      };
    }
  }
}

export function createAniListDiagnosticSuite(
  options: AniListDiagnosticSuiteOptions = {},
): AniListDiagnosticSuite {
  return new AniListDiagnosticSuite(options);
}

function summarizeRunAll(
  results: readonly AniListDiagnosticResult[],
): AniListRunAllSummary {
  const attempted = results.filter((result) => !result.skipped);
  const slowest = attempted.reduce<AniListDiagnosticResult | null>(
    (current, result) =>
      !current || result.elapsedMs > current.elapsedMs ? result : current,
    null,
  );
  const remaining = attempted.flatMap((result) =>
    result.rateLimit.remaining === null ? [] : [result.rateLimit.remaining],
  );
  return {
    passed: results.filter((result) => result.ok).length,
    total: results.length,
    averageLatencyMs:
      attempted.length === 0
        ? 0
        : Math.round(
            attempted.reduce((total, result) => total + result.elapsedMs, 0) /
              attempted.length,
          ),
    slowestTest: slowest?.testName ?? null,
    totalResponseBytes: attempted.reduce(
      (total, result) => total + result.responseBytes,
      0,
    ),
    requestsMade: attempted.reduce(
      (total, result) => total + result.requestCount,
      0,
    ),
    startingRemaining: remaining[0] ?? null,
    endingRemaining: remaining[remaining.length - 1] ?? null,
    rateLimitResponses: attempted.filter((result) => result.status === 429)
      .length,
    stoppedByRateLimit: results.some(
      (result) => result.errorKind === 'rate_limit',
    ),
  };
}
