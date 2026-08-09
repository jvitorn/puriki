import type { AnimeCatalogItem } from '@/domain/models/anime';

export interface AnimeCatalogRepository {
  getFeatured(): Promise<AnimeCatalogItem>;
  getPopular(): Promise<AnimeCatalogItem[]>;
  getSeasonal(): Promise<AnimeCatalogItem[]>;
  getUpcoming(): Promise<AnimeCatalogItem[]>;
  search(query: string): Promise<AnimeCatalogItem[]>;
  /** Resolves summary-or-better items in caller order; it is not bulk enrichment. */
  getManyByIds(ids: number[]): Promise<AnimeCatalogItem[]>;
  /** Resolves explicit details; a known summary alone does not satisfy this call. */
  getDetailsById(id: number): Promise<AnimeCatalogItem | null>;
  /** Returns only already-known catalog data and never starts network work. */
  getKnownById(id: number): AnimeCatalogItem | null;
  clearCache(): void;
}
