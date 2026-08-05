import type { AnimeCatalogItem } from '@/domain/models/anime';

export interface AnimeCatalogRepository {
  getFeatured(): Promise<AnimeCatalogItem>;
  getPopular(): Promise<AnimeCatalogItem[]>;
  getSeasonal(): Promise<AnimeCatalogItem[]>;
  getRecentlyAdded(): Promise<AnimeCatalogItem[]>;
  search(query: string): Promise<AnimeCatalogItem[]>;
  getById(id: number): Promise<AnimeCatalogItem | null>;
}
