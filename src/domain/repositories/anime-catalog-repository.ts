import type { AnimeCatalogItem } from '@/domain/models/anime';

export interface AnimeCatalogRepository {
  getFeatured(): Promise<AnimeCatalogItem>;
  getPopular(): Promise<AnimeCatalogItem[]>;
  getSeasonal(): Promise<AnimeCatalogItem[]>;
  getUpcoming(): Promise<AnimeCatalogItem[]>;
  search(query: string): Promise<AnimeCatalogItem[]>;
  /** Resolves the best known items in caller order; it is not bulk enrichment. */
  getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]>;
  getDetailsById(id: number): Promise<AnimeCatalogItem | null>;
  clearCache(): void;
}
