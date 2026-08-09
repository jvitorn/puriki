import {
  ANILIST_RUN_ALL_REQUEST_COUNT,
  aniListSeasonForDate,
  createAniListDiagnosticSuite,
} from '@/infrastructure/api/anilist/anilist-diagnostics';
import {
  anilistDetailsPayload,
  anilistPage,
  anilistResponse,
  anilistSummary,
} from '@/infrastructure/api/anilist/anilist-test-fixtures';

type RequestPayload = {
  query: string;
  variables: Record<string, unknown>;
};

function payloadFrom(init?: RequestInit): RequestPayload {
  return JSON.parse(String(init?.body)) as RequestPayload;
}

function responseFor(payload: RequestPayload): Response {
  const headers = {
    'X-RateLimit-Limit': '30',
    'X-RateLimit-Remaining': '27',
  };
  if (payload.query.includes('query AnimeDetails')) {
    return anilistResponse(
      { data: { Media: anilistDetailsPayload() } },
      200,
      headers,
    );
  }
  if (payload.query.includes('query CatalogHome')) {
    return anilistResponse(
      {
        data: {
          popular: { media: [anilistSummary({ id: 1 })] },
          seasonal: { media: [anilistSummary({ id: 2 })] },
          upcoming: { media: [anilistSummary({ id: 3 })] },
        },
      },
      200,
      headers,
    );
  }
  return anilistResponse({ data: anilistPage() }, 200, headers);
}

function createSuiteHarness() {
  const requests: RequestPayload[] = [];
  const fetchImpl = jest.fn(
    async (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = payloadFrom(init);
      requests.push(payload);
      return responseFor(payload);
    },
  );
  const suite = createAniListDiagnosticSuite({
    clientOptions: {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: jest.fn(),
    },
    coordinatorOptions: { spacingMs: 0 },
    currentDate: () => new Date('2026-08-09T12:00:00'),
  });
  return { fetchImpl, requests, suite };
}

describe('AniListDiagnosticSuite', () => {
  it.each([
    ['2026-01-10', 'WINTER'],
    ['2026-02-10', 'WINTER'],
    ['2026-03-10', 'SPRING'],
    ['2026-06-10', 'SUMMER'],
    ['2026-09-10', 'FALL'],
    ['2026-12-10', 'WINTER'],
  ] as const)('maps %s to %s', (date, season) => {
    expect(aniListSeasonForDate(new Date(`${date}T12:00:00`))).toEqual({
      season,
      seasonYear: 2026,
    });
  });

  it('runs the five permanent checks sequentially with useful metrics', async () => {
    const { fetchImpl, requests, suite } = createSuiteHarness();
    const progress = jest.fn();
    const run = await suite.runAll({
      search: 'Attack on Titan',
      onProgress: progress,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(ANILIST_RUN_ALL_REQUEST_COUNT);
    expect(run.results.map(({ testName }) => testName)).toEqual([
      'details',
      'search',
      'popular',
      'seasonal',
      'upcoming',
    ]);
    expect(run.summary).toMatchObject({
      passed: 5,
      total: 5,
      requestsMade: 5,
      startingRemaining: 27,
      endingRemaining: 27,
      stoppedByRateLimit: false,
    });
    expect(progress).toHaveBeenCalledTimes(5);
    expect(requests[0]?.variables).toEqual({ idMal: 21 });
    expect(requests[1]?.variables).toMatchObject({
      search: 'Attack on Titan',
      perPage: 10,
    });
    expect(requests[3]?.variables).toMatchObject({
      season: 'SUMMER',
      seasonYear: 2026,
    });
  });

  it('keeps the optional combined Home diagnostic to one request', async () => {
    const { fetchImpl, suite } = createSuiteHarness();
    await expect(suite.runCombinedHome()).resolves.toMatchObject({
      ok: true,
      requestCount: 1,
      resultCount: 3,
      sectionCounts: { popular: 1, seasonal: 1, upcoming: 1 },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps partial data visible while classifying GraphQL errors', async () => {
    const suite = createAniListDiagnosticSuite({
      clientOptions: {
        fetchImpl: jest.fn(async () =>
          anilistResponse({
            data: anilistPage(),
            errors: [{ message: 'score resolver failed' }],
          }),
        ) as unknown as typeof fetch,
        logger: jest.fn(),
      },
      coordinatorOptions: { spacingMs: 0 },
    });
    await expect(suite.runPopular()).resolves.toMatchObject({
      ok: false,
      errorKind: 'graphql',
      resultCount: 1,
    });
  });

  it('stops after a rate limit and skips checks without extra requests', async () => {
    const fetchImpl = jest.fn(async () =>
      anilistResponse({ errors: [{ message: 'Rate limited' }] }, 429, {
        'Retry-After': '10',
        'X-RateLimit-Remaining': '0',
      }),
    );
    const suite = createAniListDiagnosticSuite({
      clientOptions: {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        logger: jest.fn(),
      },
      coordinatorOptions: { spacingMs: 0 },
    });
    const run = await suite.runAll();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(run.results[0]).toMatchObject({
      testName: 'details',
      errorKind: 'rate_limit',
    });
    expect(run.results.slice(1).every((result) => result.skipped)).toBe(true);
    expect(run.summary.stoppedByRateLimit).toBe(true);
  });
});
