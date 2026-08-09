import { DomainError, RepositoryError } from '@/domain/errors/domain-error';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';
import { buildUserListDataset } from '@/tests/builders/mock-dataset-builder';

describe('mock repositories', () => {
  let runtime: MockRuntime;
  let catalog: MockAnimeCatalogRepository;
  let list: MockUserAnimeListRepository;

  beforeEach(() => {
    runtime = new MockRuntime(buildMockDataset());
    catalog = new MockAnimeCatalogRepository(runtime);
    list = new MockUserAnimeListRepository(runtime);
  });

  it('returns curated catalog sections and details', async () => {
    await expect(catalog.getFeatured()).resolves.toMatchObject({
      title: 'Moonlit Vanguard',
    });
    await expect(catalog.getPopular()).resolves.toHaveLength(12);
    await expect(catalog.getSeasonal()).resolves.toHaveLength(12);
    await expect(catalog.getUpcoming()).resolves.toHaveLength(12);
    await expect(catalog.getDetailsById(999)).resolves.toBeNull();
  });

  it('searches titles and alternative titles case-insensitively', async () => {
    await expect(catalog.search('NEON ronin')).resolves.toEqual([
      expect.objectContaining({ title: 'Neon Ronin' }),
    ]);
    await expect(catalog.search('gekko no senjin')).resolves.toEqual([
      expect.objectContaining({ title: 'Moonlit Vanguard' }),
    ]);
    await expect(catalog.search('')).resolves.toHaveLength(18);
  });

  it('filters and retrieves personal list entries', async () => {
    const watching = await list.getPage({
      page: 1,
      pageSize: 25,
      status: 'watching',
    });
    expect(watching.items).toHaveLength(5);
    expect(watching.totalCount).toBe(5);
    expect(watching.items.every((entry) => entry.status === 'watching')).toBe(
      true,
    );
    await expect(list.getByAnimeId(50)).resolves.toBeNull();
  });

  it('paginates 53 entries and stops after the partial final page', async () => {
    const largeRuntime = new MockRuntime(buildUserListDataset({ size: 53 }));
    const largeList = new MockUserAnimeListRepository(largeRuntime);
    await expect(
      largeList.getPage({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      page: 1,
      nextPage: 2,
      totalCount: 53,
      items: expect.arrayContaining([
        expect.objectContaining({ animeId: 10_001 }),
      ]),
    });
    await expect(
      largeList.getPage({ page: 2, pageSize: 25 }),
    ).resolves.toMatchObject({
      page: 2,
      nextPage: 3,
      totalCount: 53,
    });
    const finalPage = await largeList.getPage({ page: 3, pageSize: 25 });
    expect(finalPage.items).toHaveLength(3);
    expect(finalPage.nextPage).toBeNull();
  });

  it('filters before paginating and preserves stable isolated results', async () => {
    const largeRuntime = new MockRuntime(buildUserListDataset({ size: 53 }));
    const largeList = new MockUserAnimeListRepository(largeRuntime);
    const first = await largeList.getPage({
      page: 1,
      pageSize: 5,
      status: 'completed',
    });
    const repeated = await largeList.getPage({
      page: 1,
      pageSize: 5,
      status: 'completed',
    });
    expect(first.items).toHaveLength(5);
    expect(first.totalCount).toBe(11);
    expect(first.items).toEqual(repeated.items);
    expect(first.items.every((entry) => entry.status === 'completed')).toBe(
      true,
    );
    const originalAnimeId = repeated.items[0]?.animeId;
    if (!first.items[0]) throw new Error('Expected a paginated entry.');
    first.items[0].animeId = -1;
    const isolated = await largeList.getPage({
      page: 1,
      pageSize: 5,
      status: 'completed',
    });
    expect(isolated.items[0]?.animeId).toBe(originalAnimeId);
  });

  it.each([
    { page: 0, pageSize: 25 },
    { page: 1, pageSize: 0 },
    { page: 1.5, pageSize: 25 },
  ])('rejects invalid page requests: %o', async (request) => {
    await expect(list.getPage(request)).rejects.toThrow(/integer/);
  });

  it('updates progress and automatically completes known series', async () => {
    const updated = await list.updateProgress(1, 12);
    expect(updated).toMatchObject({ watchedEpisodes: 12, status: 'completed' });
    await expect(list.updateProgress(1, -4)).resolves.toMatchObject({
      watchedEpisodes: 0,
    });
  });

  it('allows unbounded progress for unknown totals', async () => {
    await expect(list.updateProgress(7, 99)).resolves.toMatchObject({
      watchedEpisodes: 99,
    });
  });

  it('updates statuses and scores only after explicit membership', async () => {
    await expect(list.updateStatus(1, 'plan_to_watch')).resolves.toMatchObject({
      watchedEpisodes: 0,
      status: 'plan_to_watch',
    });
    await expect(list.updateStatus(30, 'watching')).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(list.addToList(30, 'watching')).resolves.toMatchObject({
      animeId: 30,
      status: 'watching',
    });
    await expect(list.updateScore(30, 9)).resolves.toMatchObject({
      userScore: 9,
    });
    await expect(list.updateScore(30, null)).resolves.toMatchObject({
      userScore: null,
    });
    await expect(list.updateScore(30, 20)).rejects.toThrow('between 1 and 10');
    await expect(list.updateStatus(999, 'watching')).rejects.toThrow(
      'not in My List',
    );
  });

  it('adds and removes membership idempotently with deterministic defaults', async () => {
    const added = await list.addToList(30);
    expect(added).toMatchObject({
      animeId: 30,
      status: 'plan_to_watch',
      watchedEpisodes: 0,
      userScore: null,
    });
    await expect(list.addToList(30)).resolves.toEqual(added);
    expect(
      (await list.getPage({ page: 1, pageSize: 100 })).items.filter(
        (entry) => entry.animeId === 30,
      ),
    ).toHaveLength(1);
    await list.removeFromList(30);
    await expect(list.removeFromList(30)).resolves.toBeUndefined();
    await expect(list.getByAnimeId(30)).resolves.toBeNull();
  });

  it('resets all local mutations', async () => {
    await list.updateProgress(1, 8);
    await list.reset();
    await expect(list.getByAnimeId(1)).resolves.toMatchObject({
      watchedEpisodes: 1,
    });
  });

  it('supports forced repository failures', async () => {
    runtime.setForceErrors(true);
    await expect(catalog.getPopular()).rejects.toBeInstanceOf(RepositoryError);
    await expect(
      list.getPage({ page: 1, pageSize: 25 }),
    ).rejects.toBeInstanceOf(RepositoryError);
  });

  it('supports normal and slow artificial delays', async () => {
    jest.useFakeTimers();
    runtime.setDelayMode('normal');
    const normal = catalog.getPopular();
    await jest.advanceTimersByTimeAsync(350);
    await expect(normal).resolves.toHaveLength(12);
    runtime.setDelayMode('slow');
    const slow = catalog.getPopular();
    await jest.advanceTimersByTimeAsync(1200);
    await expect(slow).resolves.toHaveLength(12);
    jest.useRealTimers();
  });
});
