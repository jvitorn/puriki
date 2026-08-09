import type { AnimeCatalogItem } from '@/domain/models/anime';
import type { AnimeCatalogRepository } from '@/domain/repositories/anime-catalog-repository';
import { MockRuntime } from '@/infrastructure/repositories/mock/mock-runtime';
import { includesNormalized, normalizeSearchText } from '@/shared/utils/search';

export class MockAnimeCatalogRepository implements AnimeCatalogRepository {
  constructor(private readonly runtime: MockRuntime) {}

  getFeatured(): Promise<AnimeCatalogItem> {
    return this.runtime.run(() => {
      const featured = this.runtime.getDataset().catalog[0];
      if (!featured) throw new Error('No featured anime is available.');
      return { ...featured };
    });
  }

  getPopular(): Promise<AnimeCatalogItem[]> {
    return this.runtime.run(() => this.cloneRange(1, 13));
  }

  getSeasonal(): Promise<AnimeCatalogItem[]> {
    return this.runtime.run(() => this.cloneRange(13, 25));
  }

  getUpcoming(): Promise<AnimeCatalogItem[]> {
    return this.runtime.run(() => this.cloneRange(25, 37));
  }

  search(query: string): Promise<AnimeCatalogItem[]> {
    return this.runtime.run(() => {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return this.cloneRange(0, 18);
      return this.runtime
        .getDataset()
        .catalog.filter(
          (anime) =>
            includesNormalized(anime.title, normalizedQuery) ||
            anime.alternativeTitles.some((title) =>
              includesNormalized(title, normalizedQuery),
            ),
        )
        .map((anime) => ({ ...anime }));
    });
  }

  getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]> {
    return this.runtime.run(() => {
      const uniqueIds = new Set(ids);
      return this.runtime
        .getDataset()
        .catalog.filter((anime) => uniqueIds.has(anime.id))
        .map((anime) => ({ ...anime }));
    });
  }

  getDetailsById(id: number): Promise<AnimeCatalogItem | null> {
    return this.runtime.run(() => {
      const anime = this.runtime
        .getDataset()
        .catalog.find((item) => item.id === id);
      return anime ? { ...anime } : null;
    });
  }

  getKnownById(id: number): AnimeCatalogItem | null {
    const anime = this.runtime
      .getDataset()
      .catalog.find((item) => item.id === id);
    return anime ? { ...anime } : null;
  }

  clearCache(): void {}

  private cloneRange(start: number, end: number): AnimeCatalogItem[] {
    return this.runtime
      .getDataset()
      .catalog.slice(start, end)
      .map((anime) => ({ ...anime }));
  }
}
