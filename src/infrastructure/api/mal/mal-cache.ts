import type { AnimeCatalogItem } from '@/domain/models/anime';

export class MalCatalogCache {
  private readonly collections = new Map<string, AnimeCatalogItem[]>();
  private readonly summaries = new Map<number, AnimeCatalogItem>();
  private readonly details = new Map<number, AnimeCatalogItem | null>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  getCollection(key: string): AnimeCatalogItem[] | undefined {
    return this.collections.get(key);
  }

  setCollection(key: string, items: AnimeCatalogItem[]): void {
    this.collections.set(key, items);
    items.forEach((item) => this.summaries.set(item.id, item));
  }

  replaceCollections(
    collections: readonly (readonly [string, AnimeCatalogItem[]])[],
  ): void {
    collections.forEach(([key, items]) => this.collections.set(key, items));
    this.summaries.clear();
    this.collections.forEach((items) =>
      items.forEach((item) => this.summaries.set(item.id, item)),
    );
    this.details.forEach((item) => {
      if (item) this.summaries.set(item.id, item);
    });
  }

  replaceCollection(key: string, items: AnimeCatalogItem[]): void {
    this.collections.set(key, items);
    this.rebuildSummaries();
  }

  getSummary(id: number): AnimeCatalogItem | undefined {
    return this.summaries.get(id);
  }

  hasDetail(id: number): boolean {
    return this.details.has(id);
  }

  getDetail(id: number): AnimeCatalogItem | null | undefined {
    return this.details.get(id);
  }

  setDetail(id: number, item: AnimeCatalogItem | null): void {
    this.details.set(id, item);
    if (item) this.summaries.set(id, item);
  }

  getOrCreate<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const request = factory();
    this.inFlight.set(key, request);
    void request.then(
      () => this.deleteIfCurrent(key, request),
      () => this.deleteIfCurrent(key, request),
    );
    return request;
  }

  clear(): void {
    this.collections.clear();
    this.summaries.clear();
    this.details.clear();
    this.inFlight.clear();
  }

  private rebuildSummaries(): void {
    this.summaries.clear();
    this.collections.forEach((items) =>
      items.forEach((item) => this.summaries.set(item.id, item)),
    );
    this.details.forEach((item) => {
      if (item) this.summaries.set(item.id, item);
    });
  }

  private deleteIfCurrent(key: string, request: Promise<unknown>): void {
    if (this.inFlight.get(key) === request) this.inFlight.delete(key);
  }
}
