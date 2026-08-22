import type {
  PrimaryListProviderController,
  PrimaryListProviderSnapshot,
} from '@/application/user-list/primary-list-provider-contracts';
import type { AuthProviderId } from '@/domain/models/auth';

export class TestPrimaryListProviderController
  implements PrimaryListProviderController
{
  private readonly listeners = new Set<() => void>();
  private snapshot: PrimaryListProviderSnapshot;

  constructor(initialSnapshot: PrimaryListProviderSnapshot = { phase: 'ready', selected: null }) {
    this.snapshot = initialSnapshot;
  }

  getSnapshot = (): PrimaryListProviderSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  hydrate = async (): Promise<void> => undefined;

  select = async (provider: AuthProviderId): Promise<void> => {
    this.update({ phase: 'ready', selected: provider });
  };

  clear = async (): Promise<void> => {
    this.update({ phase: 'ready', selected: null });
  };

  update(snapshot: PrimaryListProviderSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
}

export function createTestPrimaryListProvider(
  initialSnapshot?: PrimaryListProviderSnapshot,
): TestPrimaryListProviderController {
  return new TestPrimaryListProviderController(initialSnapshot);
}
