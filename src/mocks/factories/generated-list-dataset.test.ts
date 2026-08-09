import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { MockUserAnimeListRepository } from '@/infrastructure/repositories/mock/mock-user-anime-list-repository';
import { createGeneratedListDataset } from '@/mocks/factories/generated-list-dataset';
import { buildMockDataset } from '@/mocks/fixtures/mock-dataset';

describe('createGeneratedListDataset', () => {
  it('creates exactly 100 deterministic matching catalog/list records', () => {
    const first = createGeneratedListDataset(100);
    const repeated = createGeneratedListDataset(100);
    expect(first).toEqual(repeated);
    expect(first.catalog).toHaveLength(100);
    expect(first.userEntries).toHaveLength(100);
    expect(new Set(first.catalog.map((anime) => anime.id)).size).toBe(100);
    expect(new Set(first.userEntries.map((entry) => entry.animeId))).toEqual(
      new Set(first.catalog.map((anime) => anime.id)),
    );
    expect(new Set(first.userEntries.map((entry) => entry.status))).toEqual(
      new Set(['watching', 'completed', 'on_hold', 'dropped', 'plan_to_watch']),
    );
    expect(
      new Set(first.catalog.map((anime) => anime.year)).size,
    ).toBeGreaterThan(1);
    expect(
      new Set(first.userEntries.map((entry) => entry.updatedAt)).size,
    ).toBe(100);
  });

  it('produces exactly four real 25-item pages and reset restores the baseline', async () => {
    const runtime = new MockRuntime(buildMockDataset());
    const repository = new MockUserAnimeListRepository(runtime);
    runtime.replaceDataset(createGeneratedListDataset(100));
    const pages = await Promise.all(
      [1, 2, 3, 4].map((page) => repository.getPage({ page, pageSize: 25 })),
    );
    expect(pages.map((page) => page.items.length)).toEqual([25, 25, 25, 25]);
    expect(pages.map((page) => page.nextPage)).toEqual([2, 3, 4, null]);
    expect(pages.every((page) => page.totalCount === 100)).toBe(true);
    await repository.reset();
    await expect(
      repository.getPage({ page: 1, pageSize: 25 }),
    ).resolves.toMatchObject({
      totalCount: 25,
      nextPage: null,
    });
  });
});
