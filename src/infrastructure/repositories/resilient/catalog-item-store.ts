import type { AnimeCatalogItem } from '@/domain/models/anime';

export type CatalogItemSource = 'jikan' | 'mal' | 'cache';

export interface StoredCatalogItem {
  item: AnimeCatalogItem;
  source: CatalogItemSource;
}

const SOURCE_PRIORITY: Record<CatalogItemSource, number> = {
  cache: 0,
  mal: 1,
  jikan: 2,
};

export function normalizeCatalogItemIds(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
}

function cloneItem(item: AnimeCatalogItem): AnimeCatalogItem {
  return {
    ...item,
    alternativeTitles: [...item.alternativeTitles],
    genres: [...item.genres],
    studios: [...item.studios],
  };
}

export class CatalogItemStore {
  private readonly items = new Map<number, StoredCatalogItem>();

  get(id: number): AnimeCatalogItem | undefined {
    const stored = this.items.get(id);
    return stored ? cloneItem(stored.item) : undefined;
  }

  getStored(id: number): StoredCatalogItem | undefined {
    const stored = this.items.get(id);
    return stored
      ? { item: cloneItem(stored.item), source: stored.source }
      : undefined;
  }

  getMany(ids: readonly number[]): AnimeCatalogItem[] {
    return normalizeCatalogItemIds(ids).flatMap((id) => {
      const item = this.get(id);
      return item ? [item] : [];
    });
  }

  upsert(item: AnimeCatalogItem, source: CatalogItemSource): void {
    if (!Number.isInteger(item.id) || item.id <= 0) return;
    const current = this.items.get(item.id);
    if (current && SOURCE_PRIORITY[current.source] > SOURCE_PRIORITY[source]) {
      return;
    }
    this.items.set(item.id, { item: cloneItem(item), source });
  }

  upsertMany(
    items: readonly AnimeCatalogItem[],
    source: CatalogItemSource,
  ): void {
    items.forEach((item) => this.upsert(item, source));
  }

  clear(): void {
    this.items.clear();
  }
}
