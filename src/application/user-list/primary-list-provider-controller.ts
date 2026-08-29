import type {
  PrimaryListProviderController,
  PrimaryListProviderSnapshot,
  PrimaryListProviderStore,
} from '@/application/user-list/primary-list-provider-contracts';
import type { AuthProviderId } from '@/domain/models/auth';

export class DefaultPrimaryListProviderController implements PrimaryListProviderController {
  private readonly store: PrimaryListProviderStore;
  private readonly listeners = new Set<() => void>();
  private snapshot: PrimaryListProviderSnapshot = {
    phase: 'loading',
    selected: null,
  };
  private hydration: Promise<void> | null = null;

  constructor(store: PrimaryListProviderStore) {
    this.store = store;
  }

  getSnapshot = (): PrimaryListProviderSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hydrate(): Promise<void> {
    if (this.snapshot.phase === 'ready') return Promise.resolve();
    if (this.hydration) return this.hydration;
    this.hydration = this.store
      .get()
      .then((selected) => {
        this.update({ phase: 'ready', selected });
      })
      .catch(() => {
        this.update({ phase: 'ready', selected: null });
      })
      .finally(() => {
        this.hydration = null;
      });
    return this.hydration;
  }

  async select(provider: AuthProviderId): Promise<void> {
    await this.store.set(provider);
    this.update({ phase: 'ready', selected: provider });
  }

  async clear(): Promise<void> {
    await this.store.clear();
    this.update({ phase: 'ready', selected: null });
  }

  private update(snapshot: PrimaryListProviderSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}
