import { RepositoryError } from '@/domain/errors/domain-error';
import { MockAnimeCatalogRepository } from '@/infrastructure/repositories/mock/mock-anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';

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
    const watching = await list.getByStatus('watching');
    expect(watching).toHaveLength(5);
    expect(watching.every((entry) => entry.status === 'watching')).toBe(true);
    await expect(list.getByAnimeId(50)).resolves.toBeNull();
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

  it('updates statuses and scores, including new list entries', async () => {
    await expect(list.updateStatus(1, 'plan_to_watch')).resolves.toMatchObject({
      watchedEpisodes: 0,
      status: 'plan_to_watch',
    });
    await expect(list.updateStatus(30, 'watching')).resolves.toMatchObject({
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
      'was not found',
    );
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
    await expect(list.getAll()).rejects.toBeInstanceOf(RepositoryError);
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
