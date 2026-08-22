import type { PrimaryListProviderStore } from '@/application/user-list/primary-list-provider-contracts';
import { DefaultPrimaryListProviderController } from '@/application/user-list/primary-list-provider-controller';

function createStore(initial: 'anilist' | 'mal' | null = null): jest.Mocked<PrimaryListProviderStore> {
  let stored = initial;
  return {
    get: jest.fn(async () => stored),
    set: jest.fn(async (provider) => {
      stored = provider;
    }),
    clear: jest.fn(async () => {
      stored = null;
    }),
  };
}

describe('DefaultPrimaryListProviderController', () => {
  it('starts loading and hydrates from storage', async () => {
    const store = createStore('mal');
    const controller = new DefaultPrimaryListProviderController(store);
    expect(controller.getSnapshot()).toEqual({ phase: 'loading', selected: null });

    await controller.hydrate();
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', selected: 'mal' });
  });

  it('notifies subscribers once hydrated', async () => {
    const controller = new DefaultPrimaryListProviderController(createStore());
    const listener = jest.fn();
    controller.subscribe(listener);
    await controller.hydrate();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a second hydrate once ready', async () => {
    const store = createStore('anilist');
    const controller = new DefaultPrimaryListProviderController(store);
    await controller.hydrate();
    await controller.hydrate();
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent hydrate calls into a single storage read', async () => {
    const store = createStore();
    const controller = new DefaultPrimaryListProviderController(store);
    await Promise.all([controller.hydrate(), controller.hydrate()]);
    expect(store.get).toHaveBeenCalledTimes(1);
  });

  it('persists a selection and notifies subscribers', async () => {
    const store = createStore();
    const controller = new DefaultPrimaryListProviderController(store);
    const listener = jest.fn();
    controller.subscribe(listener);

    await controller.select('mal');
    expect(store.set).toHaveBeenCalledWith('mal');
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', selected: 'mal' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('clears a selection and notifies subscribers', async () => {
    const store = createStore('anilist');
    const controller = new DefaultPrimaryListProviderController(store);
    await controller.hydrate();

    await controller.clear();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', selected: null });
  });

  it('falls back to a null selection when storage reads fail', async () => {
    const store = createStore();
    store.get.mockRejectedValueOnce(new Error('storage unavailable'));
    const controller = new DefaultPrimaryListProviderController(store);
    await controller.hydrate();
    expect(controller.getSnapshot()).toEqual({ phase: 'ready', selected: null });
  });

  it('unsubscribes listeners', async () => {
    const controller = new DefaultPrimaryListProviderController(createStore());
    const listener = jest.fn();
    const unsubscribe = controller.subscribe(listener);
    unsubscribe();
    await controller.select('anilist');
    expect(listener).not.toHaveBeenCalled();
  });
});
