import type { AnimeCatalogItem } from '@/domain/models/anime';

export type CatalogItemSource = 'jikan' | 'mal' | 'cache';
export type CatalogItemCompleteness = 'summary' | 'details';

export interface CatalogItemMetadata {
  source: CatalogItemSource;
  completeness: CatalogItemCompleteness;
}

export interface StoredCatalogItem extends CatalogItemMetadata {
  item: AnimeCatalogItem;
}

const SOURCE_PRIORITY: Record<CatalogItemSource, number> = {
  cache: 0,
  mal: 1,
  jikan: 2,
};

const COMPLETENESS_PRIORITY: Record<CatalogItemCompleteness, number> = {
  summary: 0,
  details: 1,
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
    continuity: item.continuity.map((relation) => ({ ...relation })),
  };
}

function cloneStoredItem(stored: StoredCatalogItem): StoredCatalogItem {
  return { ...stored, item: cloneItem(stored.item) };
}

export function satisfiesMinimumCompleteness(
  available: CatalogItemCompleteness,
  required: CatalogItemCompleteness,
): boolean {
  return COMPLETENESS_PRIORITY[available] >= COMPLETENESS_PRIORITY[required];
}

export function shouldReplaceStoredItem(
  current: StoredCatalogItem,
  incoming: StoredCatalogItem,
): boolean {
  const completenessDifference =
    COMPLETENESS_PRIORITY[incoming.completeness] -
    COMPLETENESS_PRIORITY[current.completeness];
  if (completenessDifference !== 0) return completenessDifference > 0;
  return SOURCE_PRIORITY[incoming.source] >= SOURCE_PRIORITY[current.source];
}

export class CatalogItemStore {
  private readonly items = new Map<number, StoredCatalogItem>();

  get(id: number): StoredCatalogItem | undefined {
    const stored = this.items.get(id);
    return stored ? cloneStoredItem(stored) : undefined;
  }

  getItem(
    id: number,
    minimumCompleteness: CatalogItemCompleteness = 'summary',
  ): AnimeCatalogItem | undefined {
    const stored = this.items.get(id);
    return stored &&
      satisfiesMinimumCompleteness(stored.completeness, minimumCompleteness)
      ? cloneItem(stored.item)
      : undefined;
  }

  getMany(
    ids: readonly number[],
    minimumCompleteness: CatalogItemCompleteness = 'summary',
  ): AnimeCatalogItem[] {
    return normalizeCatalogItemIds(ids).flatMap((id) => {
      const item = this.getItem(id, minimumCompleteness);
      return item ? [item] : [];
    });
  }

  upsert(item: AnimeCatalogItem, metadata: CatalogItemMetadata): void {
    if (!Number.isInteger(item.id) || item.id <= 0) return;
    const incoming: StoredCatalogItem = {
      item: cloneItem(item),
      ...metadata,
    };
    const current = this.items.get(item.id);
    if (current && !shouldReplaceStoredItem(current, incoming)) {
      return;
    }
    this.items.set(item.id, incoming);
  }

  upsertMany(
    items: readonly AnimeCatalogItem[],
    metadata: CatalogItemMetadata,
  ): void {
    items.forEach((item) => this.upsert(item, metadata));
  }

  clear(): void {
    this.items.clear();
  }
}
